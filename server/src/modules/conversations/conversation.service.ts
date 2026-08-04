import {
  persistCompactionMessage,
} from '../history/session-compaction.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { LegacyTimelineMigration } from './legacy-timeline-migration.js'
import {
  PrismaConversationRepository,
  type ConversationRepository,
} from './conversation-repository.js'
import { DefaultAgentSessionFactory, type AgentSessionFactory } from '../chat/agent-runtime.js'

export class ConversationService {
  constructor(
    private readonly timelineStore: TimelineEventStore,
    private readonly repository: ConversationRepository = new PrismaConversationRepository(),
    private readonly legacyTimelineMigration: LegacyTimelineMigration = new LegacyTimelineMigration(),
    private readonly sessionFactory: AgentSessionFactory = new DefaultAgentSessionFactory(),
  ) {}

  async list(projectId: string) {
    return this.repository.list(projectId)
  }

  async get(id: string) {
    const conversation = await this.repository.get(id)
    if (!conversation) throw new Error(`Conversation not found: ${id}`)
    return conversation
  }

  async delete(id: string) {
    const conversation = await this.get(id)
    if (conversation.status === 'archived') return conversation
    return this.repository.archive(id)
  }

  async startTurn(data: {
    projectId: string
    message: string
    clientMessageId: string
  }) {
    const existing = await this.repository.findByClientMessage(data.projectId, data.clientMessageId)
    if (existing) return { ...existing, created: false }

    const result = await this.repository.createInitialTurn(data)
    this.timelineStore.publish(result.startedEvent)
    return { ...result, created: true }
  }

  async continueTurn(data: {
    conversationId: string
    message: string
    clientMessageId: string
  }) {
    const conversation = await this.get(data.conversationId)
    if (conversation.status !== 'active') {
      throw new Error(`Conversation is not active: ${data.conversationId}`)
    }

    const existing = await this.repository.findTurn(conversation.id, data.clientMessageId)
    if (existing) return { conversation, run: existing, created: false }

    const result = await this.repository.createNextTurn({ ...data, title: conversation.title })
    this.timelineStore.publish(result.startedEvent)
    return {
      conversation: { ...conversation, runtimeStatus: 'queued' as const },
      run: result.run,
      created: true,
      startedEvent: result.startedEvent,
    }
  }

  async getTimeline(id: string) {
    const conversation = await this.get(id)
    let events = await this.timelineStore.list(id)
    if (events.length === 0) {
      const migrated = await this.legacyTimelineMigration.backfill(id, conversation.title)
      for (const event of migrated) this.timelineStore.publish(event)
      events = await this.timelineStore.list(id)
    }
    return { conversation, events }
  }

  async compactContext(id: string) {
    const conversation = await this.get(id)
    if (conversation.status !== 'active') {
      throw new Error(`Conversation is not active: ${id}`)
    }
    if (await this.repository.hasActiveRun(id)) {
      throw new Error('Cannot compact context while a run is active')
    }

    const sessionId = await this.getSessionId(id)
    const events: import('@superagent/core').AnyTimelineEvent[] = []
    const session = this.sessionFactory.createSession(sessionId, {
      started: async ({ id: compactionId, trigger }) => {
        events.push(await this.timelineStore.append(id, null, 'context_compaction.started', {
          id: compactionId,
          trigger,
        }))
      },
      completed: async ({ id: compactionId, trigger, result }) => {
        events.push(await this.timelineStore.append(id, null, 'context_compaction.completed', {
          id: compactionId,
          trigger,
          compactedItems: result.compactedItems,
          keptItems: result.keptItems,
          reason: result.reason,
        }))
      },
      failed: async ({ id: compactionId, trigger, error }) => {
        events.push(await this.timelineStore.append(id, null, 'context_compaction.failed', {
          id: compactionId,
          trigger,
          error,
        }))
      },
    })
    const result = await session.compact('manual')
    if (result.status !== 'compacted') return { ...result, events }
    await persistCompactionMessage(sessionId, result)
    await this.repository.touch(id)
    return { ...result, events }
  }

  getSessionId(conversationId: string) {
    return this.repository.getSessionId(conversationId)
  }
}

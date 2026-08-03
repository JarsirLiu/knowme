import { prisma } from '../../db/client.js'
import { PrismaAgentSession } from '../history/agent-session-store.js'
import {
  loadSessionCompactionOptions,
  persistCompactionMessage,
} from '../history/session-compaction.js'
import { appendTimelineEvent, TimelineEventStore } from '../events/timeline-event-store.js'

function titleFromMessage(message: string): string {
  const title = message.replace(/\s+/g, ' ').trim()
  if (!title) return 'New Task'
  return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

export class ConversationService {
  constructor(private readonly timelineStore: TimelineEventStore) {}

  async list(projectId: string) {
    return prisma.conversation.findMany({
      where: { projectId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async get(id: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) throw new Error(`Conversation not found: ${id}`)
    return conversation
  }

  async delete(id: string) {
    const conversation = await this.get(id)
    if (conversation.status === 'archived') return conversation

    return prisma.conversation.update({
      where: { id },
      data: {
        status: 'archived',
        updatedAt: new Date(),
      },
    })
  }

  async startTurn(data: {
    projectId: string
    message: string
    clientMessageId: string
  }) {
    const existing = await prisma.agentRun.findFirst({
      where: {
        clientMessageId: data.clientMessageId,
        conversation: { projectId: data.projectId },
      },
      include: { conversation: true },
    })
    if (existing) return { conversation: existing.conversation, run: existing, created: false }

    return prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          projectId: data.projectId,
          title: titleFromMessage(data.message),
          nextRunSequence: 1,
        },
      })

      await tx.agentSession.create({
        data: {
          conversationId: conversation.id,
          sessionKey: `local:${conversation.id}`,
        },
      })

      const run = await tx.agentRun.create({
        data: {
          conversationId: conversation.id,
          clientMessageId: data.clientMessageId,
          sequence: 1,
          status: 'queued',
          input: data.message,
        },
      })

      const userMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          runId: run.id,
          role: 'user',
          content: data.message,
        },
      })

      const startedEvent = await appendTimelineEvent(
        tx,
        conversation.id,
        run.id,
        'turn.started',
        {
          title: conversation.title,
          userMessageId: userMessage.id,
          userText: data.message,
          assistantMessageId: run.id,
        },
      )

      return { conversation, run, created: true, startedEvent }
    })
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

    const existing = await prisma.agentRun.findFirst({
      where: { conversationId: conversation.id, clientMessageId: data.clientMessageId },
    })
    if (existing) return { conversation, run: existing, created: false }

    const result = await prisma.$transaction(async (tx) => {
      const sequence = (await tx.conversation.update({
        where: { id: conversation.id },
        data: { nextRunSequence: { increment: 1 } },
        select: { nextRunSequence: true },
      })).nextRunSequence

      const nextRun = await tx.agentRun.create({
        data: {
          conversationId: conversation.id,
          clientMessageId: data.clientMessageId,
          sequence,
          status: 'queued',
          input: data.message,
        },
      })

      const userMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          runId: nextRun.id,
          role: 'user',
          content: data.message,
        },
      })

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })

      const startedEvent = await appendTimelineEvent(
        tx,
        conversation.id,
        nextRun.id,
        'turn.started',
        {
          title: conversation.title,
          userMessageId: userMessage.id,
          userText: data.message,
          assistantMessageId: nextRun.id,
        },
      )

      return { run: nextRun, startedEvent }
    })

    return { conversation, run: result.run, created: true, startedEvent: result.startedEvent }
  }

  async getTimeline(id: string) {
    const conversation = await this.get(id)
    let events = await this.timelineStore.list(id)
    if (events.length === 0) {
      await this.backfillLegacyTimeline(id, conversation.title)
      events = await this.timelineStore.list(id)
    }
    return { conversation, events }
  }

  async compactContext(id: string) {
    const conversation = await this.get(id)
    if (conversation.status !== 'active') {
      throw new Error(`Conversation is not active: ${id}`)
    }

    const activeRun = await prisma.agentRun.findFirst({
      where: {
        conversationId: id,
        status: { in: ['queued', 'running', 'waiting_approval'] },
      },
    })
    if (activeRun) {
      throw new Error('Cannot compact context while a run is active')
    }

    const sessionId = await this.getSessionId(id)
    const events: import('@superagent/core').AnyTimelineEvent[] = []
    const session = new PrismaAgentSession(sessionId, loadSessionCompactionOptions(), {
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
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
    return { ...result, events }
  }

  async getSessionId(conversationId: string): Promise<string> {
    const session = await prisma.agentSession.findUnique({
      where: { conversationId },
    })
    if (!session) throw new Error(`Agent session not found for conversation: ${conversationId}`)
    return session.id
  }

  private async backfillLegacyTimeline(conversationId: string, title: string) {
    await prisma.$transaction(async (tx) => {
      if (await tx.timelineEvent.count({ where: { conversationId } }) > 0) return

      const messages = await tx.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })

      for (const message of messages) {
        if (message.role === 'user') {
          await appendTimelineEvent(
            tx,
            conversationId,
            message.runId,
            'turn.started',
            {
              title,
              userMessageId: message.id,
              userText: message.content,
              assistantMessageId: message.runId ?? 'legacy-assistant-' + message.id,
            },
          )
          continue
        }

        if (message.role === 'assistant') {
          if (message.content) {
            await appendTimelineEvent(
              tx,
              conversationId,
              message.runId,
              'message.delta',
              { messageId: message.id, text: message.content },
            )
          }
          if (message.runId) {
            await appendTimelineEvent(
              tx,
              conversationId,
              message.runId,
              'run.completed',
              { output: message.content },
            )
          }
          continue
        }

        if (message.role === 'system') {
          const payload = parseCompactionPayload(message.content)
          if (!payload) continue
          await appendTimelineEvent(
            tx,
            conversationId,
            message.runId,
            'context_compaction.completed',
            {
              id: message.id,
              trigger: payload.trigger,
              compactedItems: payload.compactedItems,
              keptItems: payload.keptItems,
              reason: payload.reason,
            },
          )
        }
      }
    })
  }
}

function parseCompactionPayload(content: string): {
  trigger: 'auto' | 'manual'
  compactedItems: number
  keptItems: number
  reason?: string
} | undefined {
  try {
    const payload = JSON.parse(content) as Record<string, unknown>
    if (payload.kind !== 'context_compaction') return undefined
    return {
      trigger: payload.trigger === 'manual' ? 'manual' : 'auto',
      compactedItems: numberValue(payload.compactedItems) ?? 0,
      keptItems: numberValue(payload.keptItems) ?? 0,
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
    }
  } catch {
    return undefined
  }
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

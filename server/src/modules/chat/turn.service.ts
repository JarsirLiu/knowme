import type { FastifyReply } from 'fastify'
import { setupSSEHeaders, sendSSE } from '../../utils/sse.js'
import type { AnyTimelineEvent } from '@superagent/core'
import { ConversationService } from '../conversations/conversation.service.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { RunCoordinator } from '../runs/run-coordinator.js'
import { extractRawStreamDelta } from './stream-event-mapper.js'

export type TurnTarget =
  | { projectId: string; conversationId?: undefined }
  | { conversationId: string; projectId?: undefined }

/** HTTP boundary for creating durable runs. It never owns agent execution. */
export class TurnService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly coordinator: RunCoordinator,
    private readonly timelineStore: TimelineEventStore,
  ) {}

  async handleTurn(
    target: TurnTarget,
    message: string,
    clientMessageId: string,
    reply: FastifyReply,
  ) {
    if (!message.trim()) return reply.status(400).send({ error: 'Message cannot be empty' })
    const turn = target.projectId
      ? await this.conversationService.startTurn({ projectId: target.projectId, message, clientMessageId })
      : await this.conversationService.continueTurn({ conversationId: target.conversationId!, message, clientMessageId })

    if (turn.created) await this.coordinator.enqueue(turn.run.id)
    return reply.send({
      conversation: turn.conversation,
      conversationId: turn.conversation.id,
      title: turn.conversation.title,
      runId: turn.run.id,
      created: turn.created,
    })
  }

  async streamConversation(conversationId: string, lastEventId: string | undefined, reply: FastifyReply) {
    setupSSEHeaders(reply)
    const sequence = await this.sequenceFromEventId(conversationId, lastEventId)
    let replaying = true
    let latestSequence = sequence
    const buffered = new Map<number, AnyTimelineEvent>()
    let closed = reply.raw.writableEnded
    const close = () => {
      closed = true
    }
    reply.raw.once('close', close)
    const unsubscribe = this.timelineStore.eventHub.subscribe(conversationId, (event) => {
      if (replaying) {
        if (event.sequence > latestSequence) buffered.set(event.sequence, event)
        return
      }
      if (event.sequence <= latestSequence || closed || reply.raw.writableEnded) return
      latestSequence = event.sequence
      sendSSE(reply, event)
    })
    const heartbeat = setInterval(() => {
      if (!closed && !reply.raw.writableEnded) reply.raw.write(': heartbeat\n\n')
    }, 15_000)
    try {
      const events = await this.timelineStore.listAfter(conversationId, sequence)
      for (const event of events) {
        if (event.sequence <= latestSequence || closed || reply.raw.writableEnded) continue
        latestSequence = event.sequence
        sendSSE(reply, event)
      }
      replaying = false
      for (const event of [...buffered.values()].sort((a, b) => a.sequence - b.sequence)) {
        if (event.sequence <= latestSequence || reply.raw.writableEnded) continue
        latestSequence = event.sequence
        sendSSE(reply, event)
      }
      if (!closed) await new Promise<void>((resolve) => reply.raw.once('close', resolve))
    } finally {
      unsubscribe()
      clearInterval(heartbeat)
      reply.raw.removeListener('close', close)
      if (!reply.raw.writableEnded) reply.raw.end()
    }
  }

  private async sequenceFromEventId(conversationId: string, eventId: string | undefined) {
    if (!eventId) return 0
    const event = await this.timelineStore.findById(conversationId, eventId)
    return event?.sequence ?? 0
  }
}

export { extractRawStreamDelta }

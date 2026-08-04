import type { AnyTimelineEvent } from '@superagent/core'
import { prisma } from '../../db/client.js'
import { appendTimelineEvent } from '../events/timeline-event-store.js'

export class LegacyTimelineMigration {
  async backfill(conversationId: string, title: string): Promise<AnyTimelineEvent[]> {
    const events: AnyTimelineEvent[] = []
    await prisma.$transaction(async (tx) => {
      if (await tx.timelineEvent.count({ where: { conversationId } }) > 0) return
      const messages = await tx.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      for (const message of messages) {
        if (message.role === 'user') {
          events.push(await appendTimelineEvent(tx, conversationId, message.runId, 'turn.started', {
            title,
            userMessageId: message.id,
            userText: message.content,
            assistantMessageId: message.runId ?? 'legacy-assistant-' + message.id,
          }))
          continue
        }
        if (message.role === 'assistant') {
          if (message.content) {
            events.push(await appendTimelineEvent(tx, conversationId, message.runId, 'message.delta', {
              messageId: message.id,
              text: message.content,
            }))
          }
          if (message.runId) {
            events.push(await appendTimelineEvent(tx, conversationId, message.runId, 'run.completed', {
              output: message.content,
            }))
          }
          continue
        }
        if (message.role === 'system') {
          const payload = parseCompactionPayload(message.content)
          if (!payload) continue
          events.push(await appendTimelineEvent(tx, conversationId, message.runId, 'context_compaction.completed', {
            id: message.id,
            trigger: payload.trigger,
            compactedItems: payload.compactedItems,
            keptItems: payload.keptItems,
            reason: payload.reason,
          }))
        }
      }
    })
    return events
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

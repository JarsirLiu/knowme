import type { Agent, RunStreamEvent } from '@openai/agents'
import type { TimelineEventPayloadMap, TimelineEventType } from '@superagent/core'
import type { TimelineEventStore } from '../events/timeline-event-store.js'

export type TimelineDelta =
  | { type: 'message.delta'; data: { messageId: string; text: string } }
  | { type: 'reasoning.delta'; data: { messageId: string; text: string } }

export type StreamEventState = { sawReasoningDelta: boolean }

export async function persistRunStreamEvent(
  store: TimelineEventStore,
  conversationId: string,
  runId: string,
  event: RunStreamEvent,
  state: StreamEventState,
): Promise<void> {
  if (event.type === 'raw_model_stream_event') {
    const delta = extractRawStreamDelta(event, runId)
    if (!delta) return
    if (delta.type === 'reasoning.delta') state.sawReasoningDelta = true
    await append(store, conversationId, runId, delta.type, delta.data)
    return
  }

  if (event.type !== 'run_item_stream_event') return
  const item = event.item
  if (!item) return
  const raw = asRecord(item.rawItem) ?? {}

  if (event.name === 'tool_called' && item.type === 'tool_call_item') {
    const id = String(raw.callId ?? raw.id ?? 'unknown')
    await append(store, conversationId, runId, 'tool.called', {
      messageId: runId,
      toolCallId: id,
      name: String(raw.name ?? 'unknown'),
    })
    if (raw.arguments !== undefined) {
      await append(store, conversationId, runId, 'tool.arguments', {
        toolCallId: id,
        args: parseToolArguments(raw.arguments),
      })
    }
  }

  if (event.name === 'tool_output' && item.type === 'tool_call_output_item') {
    await append(store, conversationId, runId, 'tool.output', {
      toolCallId: String(raw.callId ?? raw.id ?? 'unknown'),
      result: raw.output,
    })
  }

  if (!state.sawReasoningDelta && event.name === 'reasoning_item_created' && item.type === 'reasoning_item') {
    const text = extractReasoningText(raw)
    if (text) {
      await append(store, conversationId, runId, 'reasoning.delta', {
        messageId: getStreamMessageId(raw, undefined, runId),
        text,
      })
    }
  }
}

export function extractRawStreamDelta(event: RunStreamEvent, fallbackMessageId: string): TimelineDelta | null {
  if (event.type !== 'raw_model_stream_event') return null
  const data = asRecord(event.data)
  if (!data) return null

  // The SDK exposes a normalized raw event and, for some providers, a nested
  // provider event. Only parse text from the normalized branch so one provider
  // delta becomes exactly one timeline event.
  const providerEvent = asRecord(data.event)
  const type = typeof data.type === 'string' ? data.type : ''
  const text = typeof data.delta === 'string' ? data.delta : ''
  if (text && (type === 'output_text_delta' || type === 'text-delta')) {
    return {
      type: 'message.delta',
      data: { messageId: getStreamMessageId(data, providerEvent, fallbackMessageId), text },
    }
  }

  const reasoningEvent = type === 'model' ? providerEvent : data
  const reasoningType = typeof reasoningEvent?.type === 'string' ? reasoningEvent.type : ''
  const reasoningText = typeof reasoningEvent?.delta === 'string' ? reasoningEvent.delta : ''
  if (reasoningText && (
    reasoningType === 'reasoning-delta' ||
    reasoningType === 'response.reasoning_summary_text.delta' ||
    reasoningType === 'response.reasoning_text.delta'
  )) {
    return {
      type: 'reasoning.delta',
      data: { messageId: getStreamMessageId(data, providerEvent, fallbackMessageId), text: reasoningText },
    }
  }
  return null
}

async function append<T extends TimelineEventType>(
  store: TimelineEventStore,
  conversationId: string,
  runId: string,
  type: T,
  data: TimelineEventPayloadMap[T],
) {
  await store.append(conversationId, runId, type, data)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function getStreamMessageId(
  data: Record<string, unknown>,
  providerEvent: Record<string, unknown> | undefined,
  fallback: string,
): string {
  for (const record of [data, providerEvent]) {
    if (!record) continue
    for (const key of ['messageId', 'itemId', 'item_id', 'id']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string
    }
  }
  return fallback
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function extractReasoningText(raw: Record<string, unknown>): string {
  const content = Array.isArray(raw.content) ? raw.content : Array.isArray(raw.rawContent) ? raw.rawContent : []
  return content.map((part) => {
    const record = asRecord(part)
    return typeof record?.text === 'string' ? record.text : ''
  }).filter(Boolean).join('')
}

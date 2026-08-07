import type { Agent, RunStreamEvent } from '@openai/agents'
import type { TimelineEventPayloadMap, TimelineEventType } from '@superagent/core'
import type { TimelineEventStore } from '../events/timeline-event-store.js'

export type TimelineDelta =
  | { type: 'message.delta'; data: { messageId: string; text: string } }
  | { type: 'reasoning.delta'; data: { messageId: string; text: string } }
  | { type: 'tool.called'; data: { messageId: string; toolCallId: string; name: string } }
  | { type: 'tool.arguments'; data: { toolCallId: string; args: unknown } }
  | { type: 'tool.arguments.delta'; data: { toolCallId: string; delta: string } }
  | { type: 'tool.output'; data: { toolCallId: string; result: unknown } }

export type StreamEventState = { sawReasoningDelta: boolean }

// ─── Dispatch ────────────────────────────────────────────────────────────────

/** @deprecated Used by tests. Prefer persistRunStreamEvent. */
export function extractRawStreamDelta(event: { type: string; data: unknown }, fallbackMessageId: string): TimelineDelta | null {
  if (event.type !== 'raw_model_stream_event') return null
  const deltas = handleRawModelEvent(event.data, fallbackMessageId)
  return deltas.length > 0 ? deltas[0] : null
}

/** @deprecated Used by tests. Prefer persistRunStreamEvent. */
export function extractRunItemStreamDelta(
  event: { name: string; item: { type: string; rawItem: unknown } },
  runId: string,
  state: StreamEventState,
): TimelineDelta | null {
  const raw = asRecord(event.item.rawItem) ?? {}
  const deltas = handleRunItemEvent(event.name, event.item.type, raw, runId, state)
  return deltas.length > 0 ? deltas[0] : null
}

export async function persistRunStreamEvent(
  store: TimelineEventStore,
  conversationId: string,
  runId: string,
  event: RunStreamEvent,
  state: StreamEventState,
  leaseOwner?: string,
): Promise<void> {
  if (event.type === 'raw_model_stream_event') {
    const deltas = handleRawModelEvent(event.data, runId)
    for (const delta of deltas) {
      if (delta.type === 'reasoning.delta') state.sawReasoningDelta = true
      await append(store, conversationId, runId, delta.type, delta.data, leaseOwner)
    }
    return
  }

  if (event.type !== 'run_item_stream_event') return
  const item = event.item
  if (!item) return
  const raw = asRecord(item.rawItem) ?? {}

  const deltas = handleRunItemEvent(event.name, item.type, raw, runId, state)
  for (const delta of deltas) {
    await append(store, conversationId, runId, delta.type, delta.data, leaseOwner)
  }
}

// ─── Raw Model Event Handlers ────────────────────────────────────────────────

type RawModelHandler = (data: Record<string, unknown>, runId: string) => TimelineDelta[]

const rawModelHandlers: RawModelHandler[] = [
  handleTextDelta,
  handleReasoningDelta,
  handleToolCallOutputItemAdded,
  handleFunctionCallArgDelta,
  handleCustomToolCallArgDelta,
]

function handleRawModelEvent(data: unknown, runId: string): TimelineDelta[] {
  const record = asRecord(data)
  if (!record) return []
  for (const handler of rawModelHandlers) {
    const result = handler(record, runId)
    if (result.length > 0) return result
  }
  return []
}

function handleTextDelta(data: Record<string, unknown>, runId: string): TimelineDelta[] {
  const type = typeof data.type === 'string' ? data.type : ''
  const text = typeof data.delta === 'string' ? data.delta : ''
  if (!text || (type !== 'output_text_delta' && type !== 'text-delta')) return []
  return [{
    type: 'message.delta',
    data: { messageId: getStreamMessageId(data, asRecord(data.event), runId), text },
  }]
}

function handleReasoningDelta(data: Record<string, unknown>, runId: string): TimelineDelta[] {
  const type = typeof data.type === 'string' ? data.type : ''
  if (type !== 'model') return []
  const providerEvent = asRecord(data.event)
  if (!providerEvent) return []
  const eventType = typeof providerEvent.type === 'string' ? providerEvent.type : ''
  const text = typeof providerEvent.delta === 'string' ? providerEvent.delta : ''
  if (!text) return []
  if (
    eventType === 'reasoning-delta' ||
    eventType === 'response.reasoning_summary_text.delta' ||
    eventType === 'response.reasoning_text.delta'
  ) {
    return [{
      type: 'reasoning.delta',
      data: { messageId: getStreamMessageId(data, providerEvent, runId), text },
    }]
  }
  return []
}

function handleToolCallOutputItemAdded(data: Record<string, unknown>, _runId: string): TimelineDelta[] {
  const type = typeof data.type === 'string' ? data.type : ''
  if (type !== 'model') return []
  const providerEvent = asRecord(data.event)
  if (!providerEvent) return []
  const eventType = typeof providerEvent.type === 'string' ? providerEvent.type : ''
  if (eventType !== 'response.output_item.added') return []
  const item = asRecord(providerEvent.item)
  if (!item) return []
  const itemType = typeof item.type === 'string' ? item.type : ''
  if (itemType !== 'function_call' && itemType !== 'custom_tool_call') return []
  const toolCallId = getToolCallId(item)
  const name = String(item.name ?? 'unknown')
  return [{
    type: 'tool.called',
    data: { messageId: getStreamMessageId(data, providerEvent, _runId), toolCallId, name },
  }]
}

function handleFunctionCallArgDelta(data: Record<string, unknown>, _runId: string): TimelineDelta[] {
  const type = typeof data.type === 'string' ? data.type : ''
  if (type !== 'model') return []
  const providerEvent = asRecord(data.event)
  if (!providerEvent) return []
  const eventType = typeof providerEvent.type === 'string' ? providerEvent.type : ''
  if (eventType !== 'response.function_call_arguments.delta') return []
  const toolCallId = pickString(providerEvent, ['call_id', 'callId', 'item_id', 'itemId'])
  const delta = typeof providerEvent.delta === 'string' ? providerEvent.delta : ''
  if (!toolCallId || !delta) return []
  return [{ type: 'tool.arguments.delta', data: { toolCallId, delta } }]
}

function handleCustomToolCallArgDelta(data: Record<string, unknown>, _runId: string): TimelineDelta[] {
  const type = typeof data.type === 'string' ? data.type : ''
  if (type !== 'model') return []
  const providerEvent = asRecord(data.event)
  if (!providerEvent) return []
  const eventType = typeof providerEvent.type === 'string' ? providerEvent.type : ''
  if (eventType !== 'response.custom_tool_call_input.delta') return []
  const toolCallId = pickString(providerEvent, ['call_id', 'callId', 'item_id', 'itemId'])
  const delta = typeof providerEvent.delta === 'string' ? providerEvent.delta : ''
  if (!toolCallId || !delta) return []
  return [{ type: 'tool.arguments.delta', data: { toolCallId, delta } }]
}

// ─── Run Item Event Handlers ─────────────────────────────────────────────────

type RunItemHandler = {
  match: (name: string, itemType: string) => boolean
  handle: (raw: Record<string, unknown>, runId: string, state: StreamEventState) => TimelineDelta[]
}

const runItemHandlers: RunItemHandler[] = [
  { match: (n, t) => n === 'tool_called' && t === 'tool_call_item', handle: handleToolCalled },
  { match: (n, t) => n === 'tool_output' && t === 'tool_call_output_item', handle: handleToolOutput },
  { match: (n, t) => n === 'reasoning_item_created' && t === 'reasoning_item', handle: handleReasoningItem },
]

function handleRunItemEvent(
  name: string,
  itemType: string,
  raw: Record<string, unknown>,
  runId: string,
  state: StreamEventState,
): TimelineDelta[] {
  for (const handler of runItemHandlers) {
    if (handler.match(name, itemType)) {
      return handler.handle(raw, runId, state)
    }
  }
  return []
}

function handleToolCalled(raw: Record<string, unknown>, runId: string, _state: StreamEventState): TimelineDelta[] {
  const id = getToolCallId(raw)
  const result: TimelineDelta[] = [{
    type: 'tool.called',
    data: { messageId: runId, toolCallId: id, name: String(raw.name ?? 'unknown') },
  }]
  if (raw.arguments !== undefined) {
    result.push({
      type: 'tool.arguments',
      data: { toolCallId: id, args: parseToolArguments(raw.arguments) },
    })
  }
  return result
}

function handleToolOutput(raw: Record<string, unknown>, _runId: string, _state: StreamEventState): TimelineDelta[] {
  return [{
    type: 'tool.output',
    data: { toolCallId: getToolCallId(raw), result: normalizeSdkToolOutput(raw.output) },
  }]
}

function handleReasoningItem(raw: Record<string, unknown>, runId: string, state: StreamEventState): TimelineDelta[] {
  if (state.sawReasoningDelta) return []
  const text = extractReasoningText(raw)
  if (!text) return []
  return [{
    type: 'reasoning.delta',
    data: { messageId: getStreamMessageId(raw, undefined, runId), text },
  }]
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function getToolCallId(raw: Record<string, unknown>): string {
  return pickString(raw, ['callId', 'call_id', 'toolCallId', 'tool_call_id', 'id']) ?? 'unknown'
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
  }
  return undefined
}

async function append<T extends TimelineEventType>(
  store: TimelineEventStore,
  conversationId: string,
  runId: string,
  type: T,
  data: TimelineEventPayloadMap[T],
  leaseOwner?: string,
) {
  if (leaseOwner) {
    await store.appendOwned(conversationId, runId, leaseOwner, type, data)
    return
  }
  await store.append(conversationId, runId, type, data)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function normalizeSdkToolOutput(value: unknown): unknown {
  const record = asRecord(value)
  if (record?.type === 'text' && typeof record.text === 'string') return record.text
  return value
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

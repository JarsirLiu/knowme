// Pure state machine for the chat timeline.

import type {
  AssistantMessage,
  AssistantPart,
  ChatEntry,
  ChatState,
  ContextCompaction,
  MessageContent,
  ToolCall,
  ToolCallStatus,
  Turn,
} from '../types'
import type { AnyTimelineEvent } from '@cloudagent/core'
import type { ConversationRuntimeStatus } from '@cloudagent/core'

export type ChatAction =
  | { type: 'LOAD_ENTRIES'; entries: ChatEntry[]; runtimeStatus?: ConversationRuntimeStatus }
  | { type: 'TIMELINE_EVENT'; event: AnyTimelineEvent }
  | { type: 'REQUEST_START' }
  | { type: 'REQUEST_END' }
  | { type: 'COMPACTION_REQUEST' }
  | { type: 'COMPACTION_END' }
  | { type: 'TURN_START'; userId: string; userText: string; turnId: string }
  | { type: 'CONTENT_APPEND'; turnId: string; content: MessageContent }
  | { type: 'TOOL_CALL_START'; turnId: string; callId: string; name: string }
  | { type: 'TOOL_CALL_ARGS'; turnId: string; callId: string; args: unknown }
  | { type: 'TOOL_CALL_STATUS'; turnId: string; callId: string; status: ToolCallStatus; result?: unknown; error?: string }
  | { type: 'MSG_STATUS'; turnId: string; status: AssistantMessage['status'] }
  | { type: 'COMPACTION_START'; compaction: ContextCompaction }
  | { type: 'COMPACTION_UPDATE'; id: string; update: Partial<ContextCompaction> }
  | { type: 'TURN_END' }
  | { type: 'CANCEL' }
  | { type: 'ERROR'; message: string; runtimeStatus?: ConversationRuntimeStatus }
  | { type: 'RESET' }

const MAX_CONTENT_LEN = 100_000

function mapTurns(entries: ChatEntry[], update: (turn: Turn) => Turn): ChatEntry[] {
  return entries.map((entry) => entry.type === 'turn' ? { ...entry, turn: update(entry.turn) } : entry)
}

function appendContent(msg: AssistantMessage, content: MessageContent): AssistantMessage {
  const last = msg.content[msg.content.length - 1]
  const lastPart = msg.parts[msg.parts.length - 1]
  if (content.type === 'text' && last?.type === 'text') {
    const combined = last.text + content.text
    const nextContent = { type: 'text' as const, text: combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined }
    return {
      ...msg,
      content: [...msg.content.slice(0, -1), nextContent],
      parts: lastPart?.type === 'content' && lastPart.content.type === 'text'
        ? [...msg.parts.slice(0, -1), { type: 'content', content: nextContent }]
        : [...msg.parts, { type: 'content', content: nextContent }],
    }
  }
  if (content.type === 'reasoning' && last?.type === 'reasoning') {
    const combined = last.text + content.text
    const nextContent = { type: 'reasoning' as const, text: combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined }
    return {
      ...msg,
      content: [...msg.content.slice(0, -1), nextContent],
      parts: lastPart?.type === 'content' && lastPart.content.type === 'reasoning'
        ? [...msg.parts.slice(0, -1), { type: 'content', content: nextContent }]
        : [...msg.parts, { type: 'content', content: nextContent }],
    }
  }
  return { ...msg, content: [...msg.content, content], parts: [...msg.parts, { type: 'content', content }] }
}

function updateToolCall(msg: AssistantMessage, callId: string, update: Partial<ToolCall>): AssistantMessage {
  return { ...msg, toolCalls: msg.toolCalls.map((tool) => tool.id === callId ? { ...tool, ...update } : tool) }
}

function isTerminal(status: ToolCallStatus) {
  return status === 'completed' || status === 'denied' || status === 'failed' || status === 'incomplete'
}

function deriveMessageStatus(msg: AssistantMessage): AssistantMessage['status'] {
  if (msg.toolCalls.some((tool) => tool.status === 'awaiting_approval')) return 'waiting_approval'
  if (msg.toolCalls.length > 0 && msg.toolCalls.every((tool) => isTerminal(tool.status)) && msg.content.length > 0) return 'completed'
  return 'streaming'
}

function isActiveRuntimeStatus(status: ConversationRuntimeStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_approval'
}

function runtimeStatusFromEntries(entries: ChatEntry[]): ConversationRuntimeStatus {
  const latestTurn = [...entries].reverse().find((entry) => entry.type === 'turn')
  if (latestTurn?.type !== 'turn') return 'idle'
  if (latestTurn.turn.assistantMessage.status === 'waiting_approval') return 'waiting_approval'
  if (latestTurn.turn.assistantMessage.status === 'streaming') return 'running'
  return 'idle'
}

function runtimeStatusForEvent(event: AnyTimelineEvent): ConversationRuntimeStatus | undefined {
  if (event.type === 'turn.started') return 'queued'
  if (event.type === 'run.started' || event.type === 'run.resumed') return 'running'
  if (event.type === 'run.waiting_approval') return 'waiting_approval'
  if (event.type === 'run.completed') return 'idle'
  if (event.type === 'run.failed') return 'failed'
  if (event.type === 'run.cancelled') return 'cancelled'
  if (event.type === 'run.interrupted') return 'interrupted'
  return undefined
}

function addAutoCompaction(entries: ChatEntry[], compaction: ContextCompaction): ChatEntry[] {
  const index = [...entries].reverse().findIndex((entry) => entry.type === 'turn' &&
    (entry.turn.assistantMessage.status === 'streaming' || entry.turn.assistantMessage.status === 'waiting_approval'))
  if (index < 0) return [...entries, { type: 'compaction', compaction }]
  const entryIndex = entries.length - 1 - index
  return entries.map((entry, currentIndex) => {
    if (currentIndex !== entryIndex || entry.type !== 'turn') return entry
    return {
      ...entry,
      turn: {
        ...entry.turn,
        assistantMessage: {
          ...entry.turn.assistantMessage,
          parts: [...entry.turn.assistantMessage.parts, { type: 'compaction', compaction }],
        },
      },
    }
  })
}

function updateCompaction(entries: ChatEntry[], id: string, update: Partial<ContextCompaction>): ChatEntry[] {
  return entries.map((entry) => {
    if (entry.type === 'compaction') {
      return entry.compaction.id === id ? { ...entry, compaction: { ...entry.compaction, ...update } } : entry
    }
    return {
      ...entry,
      turn: {
        ...entry.turn,
        assistantMessage: {
          ...entry.turn.assistantMessage,
          parts: entry.turn.assistantMessage.parts.map((part) =>
            part.type === 'compaction' && part.compaction.id === id
              ? { ...part, compaction: { ...part.compaction, ...update } }
              : part),
        },
      },
    }
  })
}

function hasCompaction(entries: ChatEntry[], id: string) {
  return entries.some((entry) => entry.type === 'compaction' && entry.compaction.id === id ||
    entry.type === 'turn' && entry.turn.assistantMessage.parts.some((part) => part.type === 'compaction' && part.compaction.id === id))
}

function updateTimelineTurn(
  entries: ChatEntry[],
  runId: string,
  update: (turn: Turn) => Turn,
): ChatEntry[] {
  return entries.map((entry) => entry.type === 'turn' && entry.turn.id === runId
    ? { ...entry, turn: update(entry.turn) }
    : entry)
}

function updateTimelineCompaction(
  entries: ChatEntry[],
  id: string,
  update: Partial<ContextCompaction>,
): ChatEntry[] {
  return entries.map((entry) => {
    if (entry.type === 'compaction') {
      return entry.compaction.id === id
        ? { ...entry, compaction: { ...entry.compaction, ...update } }
        : entry
    }
    return {
      ...entry,
      turn: {
        ...entry.turn,
        assistantMessage: {
          ...entry.turn.assistantMessage,
          parts: entry.turn.assistantMessage.parts.map((part) =>
            part.type === 'compaction' && part.compaction.id === id
              ? { ...part, compaction: { ...part.compaction, ...update } }
              : part),
        },
      },
    }
  })
}

export function applyTimelineEvent(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  if (event.type === 'turn.started') {
    if (entries.some((entry) => entry.type === 'turn' && entry.turn.id === event.runId)) return entries
    return [...entries, {
      type: 'turn',
      turn: {
        id: event.runId ?? event.id,
        userMessage: {
          id: event.data.userMessageId,
          role: 'user',
          status: 'completed',
          content: [{ type: 'text', text: event.data.userText }],
        },
        assistantMessage: {
          id: event.data.assistantMessageId,
          role: 'assistant',
          status: 'streaming',
          content: [],
          toolCalls: [],
          parts: [],
        },
      },
    }]
  }

  const runId = event.runId
  if (event.type === 'context_compaction.started') {
    const compaction: ContextCompaction = {
      id: event.data.id,
      trigger: event.data.trigger,
      status: 'running',
    }
    if (!runId) return [...entries, { type: 'compaction', compaction }]
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: {
        ...turn.assistantMessage,
        parts: [...turn.assistantMessage.parts, { type: 'compaction', compaction }],
      },
    }))
  }

  if (
    event.type === 'context_compaction.completed' ||
    event.type === 'context_compaction.failed'
  ) {
    const update: Partial<ContextCompaction> = event.type === 'context_compaction.completed'
      ? {
          status: 'completed',
          compactedItems: event.data.compactedItems,
          keptItems: event.data.keptItems,
          reason: event.data.reason,
        }
      : { status: 'failed', error: event.data.error }
    const updated = updateTimelineCompaction(entries, event.data.id, update)
    if (hasCompaction(updated, event.data.id)) return updated
    return [...updated, {
      type: 'compaction',
      compaction: {
        id: event.data.id,
        trigger: event.data.trigger,
        status: update.status ?? 'failed',
        ...update,
      },
    }]
  }

  if (!runId) return entries

  if (event.type === 'message.delta') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: appendContent(turn.assistantMessage, {
        type: 'text',
        text: event.data.text,
      }),
    }))
  }

  if (event.type === 'reasoning.delta') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: appendContent(turn.assistantMessage, {
        type: 'reasoning',
        text: event.data.text,
      }),
    }))
  }

  if (event.type === 'tool.called') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: {
        ...turn.assistantMessage,
        toolCalls: turn.assistantMessage.toolCalls.some((tool) => tool.id === event.data.toolCallId)
          ? turn.assistantMessage.toolCalls
          : [
              ...turn.assistantMessage.toolCalls,
              { id: event.data.toolCallId, name: event.data.name, args: {}, status: 'running' },
            ],
        parts: turn.assistantMessage.parts.some((part) => part.type === 'tool' && part.callId === event.data.toolCallId)
          ? turn.assistantMessage.parts
          : [...turn.assistantMessage.parts, { type: 'tool', callId: event.data.toolCallId }],
      },
    }))
  }

  if (event.type === 'tool.arguments') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, { args: event.data.args, rawArgs: undefined }),
    }))
  }

  if (event.type === 'tool.arguments.delta') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: (() => {
        const tool = turn.assistantMessage.toolCalls.find((t) => t.id === event.data.toolCallId)
        if (!tool) return turn.assistantMessage
        const prev = tool.rawArgs ?? ''
        return updateToolCall(turn.assistantMessage, event.data.toolCallId, { rawArgs: prev + event.data.delta })
      })(),
    }))
  }

  if (event.type === 'tool.awaiting_approval') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, {
        args: event.data.args,
        status: 'awaiting_approval',
      }),
    }))
  }

  if (event.type === 'tool.approved') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, { status: 'running' }),
    }))
  }

  if (event.type === 'tool.output') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, {
        status: 'completed',
        result: event.data.result,
      }),
    }))
  }

  if (event.type === 'tool.denied') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, { status: 'denied' }),
    }))
  }

  if (event.type === 'tool.failed') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: updateToolCall(turn.assistantMessage, event.data.toolCallId, {
        status: 'failed',
        error: event.data.error,
      }),
    }))
  }

  if (event.type === 'subagent.started') {
    return updateTimelineTurn(entries, runId, (turn) => {
      const msg = turn.assistantMessage
      let targetId = msg.toolCalls.find((t) => t.id === event.data.toolCallId)?.id
      if (!targetId) {
        for (let i = msg.toolCalls.length - 1; i >= 0; i -= 1) {
          if (msg.toolCalls[i].status === 'running' && !msg.toolCalls[i].childConversationId) {
            targetId = msg.toolCalls[i].id
            break
          }
        }
      }
      if (!targetId) return turn
      return {
        ...turn,
        assistantMessage: {
          ...msg,
          toolCalls: msg.toolCalls.map((t) =>
            t.id === targetId
              ? { ...t, childConversationId: event.data.childConversationId }
              : t,
          ),
        },
      }
    })
  }

  if (event.type === 'subagent.completed') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: {
        ...turn.assistantMessage,
        toolCalls: turn.assistantMessage.toolCalls.map((tool) =>
          tool.childConversationId === event.data.childConversationId
            ? { ...tool, status: 'completed' }
            : tool,
        ),
      },
    }))
  }

  if (event.type === 'run.waiting_approval') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: { ...turn.assistantMessage, status: 'waiting_approval' },
    }))
  }

  if (event.type === 'run.started' || event.type === 'run.resumed') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: { ...turn.assistantMessage, status: 'streaming' },
    }))
  }

  if (event.type === 'run.completed') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: { ...turn.assistantMessage, status: 'completed' },
    }))
  }

  if (event.type === 'run.failed' || event.type === 'run.cancelled' || event.type === 'run.interrupted') {
    return updateTimelineTurn(entries, runId, (turn) => ({
      ...turn,
      assistantMessage: {
        ...turn.assistantMessage,
        status: 'incomplete',
        error: event.data.error,
      },
    }))
  }

  return entries
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_ENTRIES':
      {
        const runtimeStatus = action.runtimeStatus ?? runtimeStatusFromEntries(action.entries)
        return {
          ...state,
          entries: action.entries,
          runtimeStatus,
          isLoading: state.requestPending || isActiveRuntimeStatus(runtimeStatus),
          isCompacting: false,
          error: null,
        }
      }

    case 'TIMELINE_EVENT': {
      const event = action.event
      const runtimeStatus = runtimeStatusForEvent(event) ?? state.runtimeStatus
      return {
        ...state,
        entries: applyTimelineEvent(state.entries, event),
        runtimeStatus,
        isLoading: state.requestPending || isActiveRuntimeStatus(runtimeStatus),
        isCompacting: event.type === 'context_compaction.started'
          ? true
          : event.type === 'context_compaction.completed' || event.type === 'context_compaction.failed'
            ? false
            : state.isCompacting,
      }
    }

    case 'REQUEST_START':
      return { ...state, runtimeStatus: 'queued', requestPending: true, isLoading: true, error: null }

    case 'REQUEST_END':
      return {
        ...state,
        requestPending: false,
        isLoading: isActiveRuntimeStatus(state.runtimeStatus),
      }

    case 'COMPACTION_REQUEST':
      return { ...state, isCompacting: true, error: null }

    case 'COMPACTION_END':
      return { ...state, isCompacting: false }

    case 'TURN_START': {
      const turn: Turn = {
        id: action.turnId,
        userMessage: { id: action.userId, role: 'user', status: 'completed', content: [{ type: 'text', text: action.userText }] },
        assistantMessage: { id: `assistant-${action.turnId}`, role: 'assistant', status: 'streaming', content: [], toolCalls: [], parts: [] },
      }
      return { ...state, entries: [...state.entries, { type: 'turn', turn }], runtimeStatus: 'queued', requestPending: false, isLoading: true, error: null }
    }

    case 'CONTENT_APPEND':
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.id === action.turnId
        ? { ...turn, assistantMessage: appendContent(turn.assistantMessage, action.content) } : turn) }

    case 'TOOL_CALL_START':
      return { ...state, entries: mapTurns(state.entries, (turn) => {
        if (turn.id !== action.turnId) return turn
        const tool: ToolCall = { id: action.callId, name: action.name, args: {}, status: 'running' }
        return { ...turn, assistantMessage: { ...turn.assistantMessage, toolCalls: [...turn.assistantMessage.toolCalls, tool], parts: [...turn.assistantMessage.parts, { type: 'tool', callId: action.callId }] } }
      }) }

    case 'TOOL_CALL_ARGS':
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.id === action.turnId
        ? { ...turn, assistantMessage: updateToolCall(turn.assistantMessage, action.callId, { args: action.args }) } : turn) }

    case 'TOOL_CALL_STATUS':
      return { ...state, entries: mapTurns(state.entries, (turn) => action.turnId !== 'latest' && turn.id !== action.turnId
        ? turn : { ...turn, assistantMessage: updateToolCall(turn.assistantMessage, action.callId, { status: action.status, result: action.result, error: action.error }) }) }

    case 'MSG_STATUS':
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.id === action.turnId
        ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: action.status } } : turn) }

    case 'COMPACTION_START':
      return { ...state, entries: action.compaction.trigger === 'auto'
        ? addAutoCompaction(state.entries, action.compaction)
        : [...state.entries, { type: 'compaction', compaction: action.compaction }], isCompacting: true }

    case 'COMPACTION_UPDATE': {
      const entries = updateCompaction(state.entries, action.id, action.update)
      return { ...state, entries: hasCompaction(entries, action.id) ? entries : [...entries, { type: 'compaction', compaction: { id: action.id, trigger: 'auto', status: 'failed', ...action.update } }], isCompacting: action.update.status === 'running' ? true : state.isCompacting && action.update.status === undefined ? state.isCompacting : false }
    }

    case 'TURN_END':
      return {
        ...state,
        entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'completed' ? turn : { ...turn, assistantMessage: { ...turn.assistantMessage, status: deriveMessageStatus(turn.assistantMessage) } }),
        runtimeStatus: 'idle',
        requestPending: false,
        isLoading: false,
      }

    case 'CANCEL':
      return {
        ...state,
        entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'streaming' || turn.assistantMessage.status === 'waiting_approval'
          ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: 'incomplete' } } : turn),
        runtimeStatus: 'cancelled',
        requestPending: false,
        isLoading: false,
        error: null,
      }

    case 'ERROR':
      {
        const runtimeStatus = action.runtimeStatus ?? state.runtimeStatus
        return {
          ...state,
          entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'streaming' || turn.assistantMessage.status === 'waiting_approval'
            ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: 'incomplete' } } : turn),
          runtimeStatus,
          requestPending: false,
          isLoading: isActiveRuntimeStatus(runtimeStatus),
          isCompacting: false,
          error: action.message,
        }
      }

    case 'RESET':
      return { entries: [], runtimeStatus: 'idle', requestPending: false, isLoading: false, isCompacting: false, error: null }

    default:
      return state
  }
}

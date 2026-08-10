// Pure state machine for the chat timeline.
//
// Two layers:
//  - timeline-handlers: maps a single timeline event to the next entries list
//    (one pure function per event type, dispatched by event type).
//  - chatReducer: the top-level reducer that handles UI actions (request
//    lifecycle, compaction requests) and delegates timeline events to the
//    handlers.

import type {
  AssistantMessage,
  ChatEntry,
  ChatState,
  ContextCompaction,
  MessageContent,
  ToolCall,
  ToolCallStatus,
  Turn,
} from '../types'
import type { AnyTimelineEvent, ConversationRuntimeStatus } from '@superagent/core'
import { applyTimelineEvent } from './timeline-handlers'

export { applyTimelineEvent } from './timeline-handlers'
import {
  appendContent,
  deriveMessageStatus,
  hasCompaction,
  isActiveRuntimeStatus,
  mapTurns,
  runtimeStatusFromEntries,
  updateTimelineCompaction,
  updateToolCall,
} from './timeline-utils'

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

const COMPACTION_START_EVENTS = new Set([
  'context_compaction.started',
  'context_compaction.completed',
  'context_compaction.failed',
  'context_compaction.skipped',
])

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
        isCompacting: COMPACTION_START_EVENTS.has(event.type)
          ? event.type === 'context_compaction.started'
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
      return { ...state, entries: [...state.entries, { type: 'compaction', compaction: action.compaction }], isCompacting: true }

    case 'COMPACTION_UPDATE': {
      const entries = updateTimelineCompaction(state.entries, action.id, action.update)
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

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

export type ChatAction =
  | { type: 'LOAD_ENTRIES'; entries: ChatEntry[] }
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
  | { type: 'ERROR'; message: string }
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

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_ENTRIES':
      return { ...state, entries: action.entries, isLoading: false, isCompacting: false, error: null }

    case 'TURN_START': {
      const turn: Turn = {
        id: action.turnId,
        userMessage: { id: action.userId, role: 'user', status: 'completed', content: [{ type: 'text', text: action.userText }] },
        assistantMessage: { id: `assistant-${action.turnId}`, role: 'assistant', status: 'streaming', content: [], toolCalls: [], parts: [] },
      }
      return { ...state, entries: [...state.entries, { type: 'turn', turn }], isLoading: true, error: null }
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
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'completed' ? turn : { ...turn, assistantMessage: { ...turn.assistantMessage, status: deriveMessageStatus(turn.assistantMessage) } }), isLoading: false }

    case 'CANCEL':
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'streaming' || turn.assistantMessage.status === 'waiting_approval'
        ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: 'incomplete' } } : turn), isLoading: false, error: null }

    case 'ERROR':
      return { ...state, entries: mapTurns(state.entries, (turn) => turn.assistantMessage.status === 'streaming' || turn.assistantMessage.status === 'waiting_approval'
        ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: 'incomplete' } } : turn), isLoading: false, isCompacting: false, error: action.message }

    case 'RESET':
      return { entries: [], isLoading: false, isCompacting: false, error: null }

    default:
      return state
  }
}

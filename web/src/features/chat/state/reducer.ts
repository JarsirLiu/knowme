// Pure state machine — no side effects, no React dependencies
// All state transitions are explicit and exhaustive

import type {
  ChatState,
  Turn,
  AssistantMessage,
  ToolCall,
  ToolCallStatus,
  MessageContent,
  AssistantPart,
} from '../types'

export type ChatAction =
  | { type: 'LOAD_TURNS'; turns: Turn[] }
  | { type: 'TURN_START'; userId: string; userText: string; turnId: string }
  | { type: 'CONTENT_APPEND'; turnId: string; content: MessageContent }
  | { type: 'TOOL_CALL_START'; turnId: string; callId: string; name: string }
  | { type: 'TOOL_CALL_ARGS'; turnId: string; callId: string; args: unknown }
  | { type: 'TOOL_CALL_STATUS'; turnId: string; callId: string; status: ToolCallStatus; result?: unknown; error?: string }
  | { type: 'MSG_STATUS'; turnId: string; status: AssistantMessage['status'] }
  | { type: 'TURN_END' }
  | { type: 'CANCEL' }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' }

const MAX_CONTENT_LEN = 100_000

function appendContent(msg: AssistantMessage, content: MessageContent): AssistantMessage {
  const last = msg.content[msg.content.length - 1]
  const lastPart = msg.parts[msg.parts.length - 1]
  if (content.type === 'text' && last?.type === 'text') {
    const combined = last.text + content.text
    const trimmed = combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined
    const nextContent = { type: 'text' as const, text: trimmed }
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
    const trimmed = combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined
    const nextContent = { type: 'reasoning' as const, text: trimmed }
    return {
      ...msg,
      content: [...msg.content.slice(0, -1), nextContent],
      parts: lastPart?.type === 'content' && lastPart.content.type === 'reasoning'
        ? [...msg.parts.slice(0, -1), { type: 'content', content: nextContent }]
        : [...msg.parts, { type: 'content', content: nextContent }],
    }
  }
  return {
    ...msg,
    content: [...msg.content, content],
    parts: [...msg.parts, { type: 'content', content }],
  }
}

function findToolCall(msg: AssistantMessage, callId: string): ToolCall | undefined {
  return msg.toolCalls.find((tc) => tc.id === callId)
}

function updateToolCall(
  msg: AssistantMessage,
  callId: string,
  update: Partial<ToolCall>,
): AssistantMessage {
  return {
    ...msg,
    toolCalls: msg.toolCalls.map((tc) => (tc.id === callId ? { ...tc, ...update } : tc)),
  }
}

function isToolCallStatusTerminal(status: ToolCallStatus): boolean {
  return status === 'completed' || status === 'denied' || status === 'failed' || status === 'incomplete'
}

function deriveMessageStatus(msg: AssistantMessage): AssistantMessage['status'] {
  const hasPendingApproval = msg.toolCalls.some((tc) => tc.status === 'awaiting_approval')
  if (hasPendingApproval) return 'waiting_approval'

  const allToolsTerminal = msg.toolCalls.length > 0 && msg.toolCalls.every((tc) => isToolCallStatusTerminal(tc.status))
  if (allToolsTerminal && msg.content.length > 0) return 'completed'

  return 'streaming'
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_TURNS':
      return { ...state, turns: action.turns, isLoading: false, error: null }

    case 'TURN_START': {
      const userMessage: Turn['userMessage'] = {
        id: action.userId,
        role: 'user',
        status: 'completed',
        content: [{ type: 'text', text: action.userText }],
      }
      const assistantMessage: AssistantMessage = {
        id: `assistant-${action.turnId}`,
        role: 'assistant',
        status: 'streaming',
        content: [],
        toolCalls: [],
        parts: [],
      }
      const turn: Turn = {
        id: action.turnId,
        userMessage,
        assistantMessage,
      }
      return {
        ...state,
        turns: [...state.turns, turn],
        isLoading: true,
        error: null,
      }
    }

    case 'CONTENT_APPEND': {
      return {
        ...state,
        turns: state.turns.map((turn) =>
          turn.id === action.turnId
            ? { ...turn, assistantMessage: appendContent(turn.assistantMessage, action.content) }
            : turn,
        ),
      }
    }

    case 'TOOL_CALL_START': {
      const newToolCall: ToolCall = {
        id: action.callId,
        name: action.name,
        args: {},
        status: 'running',
      }
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (turn.id !== action.turnId) return turn
          const updated: AssistantMessage = {
            ...turn.assistantMessage,
            toolCalls: [...turn.assistantMessage.toolCalls, newToolCall],
            parts: [...turn.assistantMessage.parts, { type: 'tool', callId: action.callId }],
          }
          return { ...turn, assistantMessage: updated }
        }),
      }
    }

    case 'TOOL_CALL_ARGS': {
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (turn.id !== action.turnId) return turn
          const updated = updateToolCall(turn.assistantMessage, action.callId, { args: action.args })
          return { ...turn, assistantMessage: updated }
        }),
      }
    }

    case 'TOOL_CALL_STATUS': {
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (action.turnId !== 'latest' && turn.id !== action.turnId) return turn
          const updated = updateToolCall(turn.assistantMessage, action.callId, {
            status: action.status,
            result: action.result,
            error: action.error,
          })
          return { ...turn, assistantMessage: updated }
        }),
      }
    }

    case 'MSG_STATUS': {
      return {
        ...state,
        turns: state.turns.map((turn) =>
          turn.id === action.turnId
            ? { ...turn, assistantMessage: { ...turn.assistantMessage, status: action.status } }
            : turn,
        ),
      }
    }

    case 'TURN_END': {
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (turn.assistantMessage.status === 'completed') return turn
          const derived = deriveMessageStatus(turn.assistantMessage)
          return {
            ...turn,
            assistantMessage: { ...turn.assistantMessage, status: derived },
          }
        }),
        isLoading: false,
      }
    }

    case 'CANCEL': {
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (turn.assistantMessage.status !== 'streaming' && turn.assistantMessage.status !== 'waiting_approval') {
            return turn
          }
          return {
            ...turn,
            assistantMessage: { ...turn.assistantMessage, status: 'incomplete' },
          }
        }),
        isLoading: false,
        error: null,
      }
    }

    case 'ERROR': {
      return {
        ...state,
        turns: state.turns.map((turn) => {
          if (turn.assistantMessage.status === 'streaming' || turn.assistantMessage.status === 'waiting_approval') {
            return {
              ...turn,
              assistantMessage: { ...turn.assistantMessage, status: 'incomplete' },
            }
          }
          return turn
        }),
        isLoading: false,
        error: action.message,
      }
    }

    case 'RESET': {
      return { turns: [], isLoading: false, error: null }
    }

    default:
      return state
  }
}

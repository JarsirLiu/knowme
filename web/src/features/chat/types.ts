// Domain types — pure data, no behavior
// Aligns with @openai/agents SDK lifecycle: in_progress | completed | incomplete

import type { ConversationRuntimeStatus } from '@superagent/core'

export type ToolCallStatus =
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'denied'
  | 'failed'
  | 'incomplete'

export type AssistantMessageStatus =
  | 'streaming'
  | 'waiting_approval'
  | 'completed'
  | 'incomplete'

export interface ToolCall {
  id: string
  name: string
  args: unknown
  rawArgs?: string
  status: ToolCallStatus
  result?: unknown
  error?: string
  childConversationId?: string
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface ReasoningContent {
  type: 'reasoning'
  text: string
}

export interface ContextCompaction {
  id: string
  trigger: 'auto' | 'manual'
  status: 'running' | 'completed' | 'failed' | 'skipped'
  compactedItems?: number
  keptItems?: number
  reason?: string
  error?: string
}

export type MessageContent = TextContent | ReasoningContent

export type AssistantPart =
  | { type: 'content'; content: MessageContent }
  | { type: 'tool'; callId: string }

export interface AssistantMessage {
  id: string
  role: 'assistant'
  status: AssistantMessageStatus
  error?: string
  content: MessageContent[]
  toolCalls: ToolCall[]
  parts: AssistantPart[]
}

export interface UserMessage {
  id: string
  role: 'user'
  status: 'completed'
  content: TextContent[]
}

export interface Turn {
  id: string
  userMessage: UserMessage
  assistantMessage: AssistantMessage
}

export type ChatEntry =
  | { type: 'turn'; turn: Turn }
  | { type: 'compaction'; compaction: ContextCompaction }

export interface ChatState {
  entries: ChatEntry[]
  runtimeStatus: ConversationRuntimeStatus
  requestPending: boolean
  isLoading: boolean
  isCompacting: boolean
  error: string | null
}

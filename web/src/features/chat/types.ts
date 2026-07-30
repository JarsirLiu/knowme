// Domain types — pure data, no behavior
// Aligns with @openai/agents SDK lifecycle: in_progress | completed | incomplete

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
  status: ToolCallStatus
  result?: unknown
  error?: string
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface ReasoningContent {
  type: 'reasoning'
  text: string
}

export type MessageContent = TextContent | ReasoningContent

export interface AssistantMessage {
  id: string
  role: 'assistant'
  status: AssistantMessageStatus
  content: MessageContent[]
  toolCalls: ToolCall[]
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

export interface ChatState {
  turns: Turn[]
  isLoading: boolean
  error: string | null
}

export type MessageRole = 'user' | 'assistant' | 'tool'

export interface TextContent {
  type: 'text'
  text: string
}

export interface ReasoningContent {
  type: 'reasoning'
  text: string
}

export type MessageContent = TextContent | ReasoningContent

export interface ToolSummary {
  actions: string[]
  completed: boolean
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: MessageContent[]
  toolSummary?: ToolSummary
  createdAt: string
}
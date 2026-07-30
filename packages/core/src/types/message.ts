export type MessageRole = 'user' | 'assistant' | 'tool'

export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolCallContent {
  type: 'tool_call'
  id: string
  name: string
  args: unknown
}

export interface ToolResultContent {
  type: 'tool_result'
  id: string
  name: string
  result: unknown
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: MessageContent[]
  createdAt: string
}
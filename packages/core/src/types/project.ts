export interface Project {
  id: string
  name: string
  rootPath: string
  settingsJson?: string | null
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  projectId: string
  title: string
  status: 'active' | 'archived'
  agentProfile: string
  createdAt: string
  updatedAt: string
}

export interface TimelineToolCall {
  id: string
  name: string
  args: unknown
  status: string
  result?: unknown
  error?: string
}

export interface TimelineMessage {
  id: string
  runId?: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: TimelineToolCall[]
  createdAt: string
}

export interface ConversationTimeline {
  conversation: Conversation
  messages: TimelineMessage[]
}

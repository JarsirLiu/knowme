export type ToolCallStatus = 'running' | 'awaiting_approval' | 'completed' | 'denied' | 'failed'

export interface ToolCall {
  id: string
  sessionId: string
  name: string
  args: unknown
  status: ToolCallStatus
  result?: unknown
  error?: string
  createdAt: string
}
import type { ConversationTimelineResponse, SSEEvent, StartTurnRequest, StartTurnResult } from '@cloudagent/core'

export interface ChatClient {
  getTimeline(conversationId: string): Promise<ConversationTimelineResponse>
  subscribeConversationEvents(
    conversationId: string,
    signal?: AbortSignal,
    lastEventId?: string,
  ): AsyncGenerator<SSEEvent>
  startDraftTurn(projectId: string, req: StartTurnRequest): Promise<StartTurnResult>
  continueTurn(conversationId: string, req: StartTurnRequest): Promise<StartTurnResult>
  compactContext(conversationId: string): Promise<{
    status: 'compacted' | 'skipped' | 'failed'
    compactedItems: number
    keptItems: number
    reason?: string
    events: SSEEvent[]
  }>
  approveToolCall(conversationId: string, toolCallId: string): Promise<void>
  denyToolCall(conversationId: string, toolCallId: string): Promise<void>
  cancelRun(conversationId: string, runId: string): Promise<void>
}
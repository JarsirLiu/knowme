export interface TextDeltaEvent {
  type: 'text_delta'
  data: { text: string }
}

export interface ReasoningDeltaEvent {
  type: 'reasoning_delta'
  data: { text: string }
}

export interface ToolCallStartEvent {
  type: 'tool_call_start'
  data: { id: string; name: string }
}

export interface ToolCallDeltaEvent {
  type: 'tool_call_delta'
  data: { id: string; delta: string }
}

export interface ToolCallAwaitingApprovalEvent {
  type: 'tool_call_awaiting_approval'
  data: { id: string; name: string; args: unknown }
}

export interface ToolCallCompletedEvent {
  type: 'tool_call_completed'
  data: { id: string; result: unknown }
}

export interface ToolCallDeniedEvent {
  type: 'tool_call_denied'
  data: { id: string }
}

export interface ToolCallFailedEvent {
  type: 'tool_call_failed'
  data: { id: string; error: string }
}

export interface ErrorEvent {
  type: 'error'
  data: { message: string }
}

export interface StatusEvent {
  type: 'status'
  data: { status: 'thinking' | 'idle' | 'error' }
}

export interface ConversationCreatedEvent {
  type: 'conversation_created'
  data: { conversationId: string; runId: string; title: string }
}

export interface SessionCreatedEvent {
  type: 'session.created'
  data: { id: string; name: string }
}

export interface SessionUpdatedEvent {
  type: 'session.updated'
  data: { id: string; name: string }
}

export type SSEEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallAwaitingApprovalEvent
  | ToolCallCompletedEvent
  | ToolCallDeniedEvent
  | ToolCallFailedEvent
  | ErrorEvent
  | StatusEvent
  | ConversationCreatedEvent
  | SessionCreatedEvent
  | SessionUpdatedEvent

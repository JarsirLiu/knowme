import type { Conversation } from './project.js'

export type TimelineEventType =
  | 'turn.started'
  | 'run.started'
  | 'run.waiting_approval'
  | 'run.resumed'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.interrupted'
  | 'run.usage'
  | 'request.error'
  | 'message.delta'
  | 'reasoning.delta'
  | 'tool.called'
  | 'tool.arguments'
  | 'tool.arguments.delta'
  | 'tool.awaiting_approval'
  | 'tool.approved'
  | 'tool.output'
  | 'tool.denied'
  | 'tool.failed'
  | 'subagent.started'
  | 'subagent.completed'
  | 'context_compaction.started'
  | 'context_compaction.completed'
  | 'context_compaction.failed'

export interface TimelineEventPayloadMap {
  'turn.started': {
    title: string
    userMessageId: string
    userText: string
    assistantMessageId: string
  }
  'run.started': Record<string, never>
  'run.waiting_approval': Record<string, never>
  'run.resumed': Record<string, never>
  'run.completed': { output: string }
  'run.failed': { error: string }
  'run.cancelled': { error: string }
  'run.interrupted': { error: string }
  'run.usage': {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedTokens: number
    source: string
  }
  'request.error': { message: string }
  'message.delta': { messageId: string; text: string }
  'reasoning.delta': { messageId: string; text: string }
  'tool.called': { messageId: string; toolCallId: string; name: string }
  'tool.arguments': { toolCallId: string; args: unknown }
  'tool.arguments.delta': { toolCallId: string; delta: string }
  'tool.awaiting_approval': { toolCallId: string; name: string; args: unknown }
  'tool.approved': { toolCallId: string }
  'tool.output': { toolCallId: string; result: unknown }
  'tool.denied': { toolCallId: string }
  'tool.failed': { toolCallId: string; error: string }
  'subagent.started': { childConversationId: string; title: string; toolCallId: string }
  'subagent.completed': { childConversationId: string; result: string }
  'context_compaction.started': { id: string; trigger: 'auto' | 'manual' }
  'context_compaction.completed': {
    id: string
    trigger: 'auto' | 'manual'
    compactedItems: number
    keptItems: number
    reason?: string
  }
  'context_compaction.failed': {
    id: string
    trigger: 'auto' | 'manual'
    error: string
  }
}

export type TimelineEvent<T extends TimelineEventType = TimelineEventType> = {
  [K in T]: {
    id: string
    conversationId: string
    runId: string | null
    sequence: number
    type: K
    data: TimelineEventPayloadMap[K]
    createdAt: string
  }
}[T]

export type AnyTimelineEvent = TimelineEvent<TimelineEventType>

export interface ConversationTimeline {
  conversation: Conversation
  events: AnyTimelineEvent[]
}

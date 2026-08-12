// Event-to-entries mapping for the chat timeline.
//
// Each timeline event type maps to a single pure handler that takes the current
// entries and the event, and returns the next entries. This keeps the reducer
// itself tiny: it only looks up the handler by event type. Adding a new event
// means adding one function here plus a table entry — never a growing switch.

import type { ChatEntry, ContextCompaction } from '../types'
import type { AnyTimelineEvent } from '@cloudagent/core'
import {
  appendContent,
  hasCompaction,
  updateTimelineCompaction,
  updateTimelineTurn,
  updateToolCall,
} from './timeline-utils'

type Handler = (entries: ChatEntry[], event: AnyTimelineEvent) => ChatEntry[]

// --- Turn lifecycle ---

function handleTurnStarted(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'turn.started' }>
  if (entries.some((entry) => entry.type === 'turn' && entry.turn.id === e.runId)) return entries
  return [...entries, {
    type: 'turn',
    turn: {
      id: e.runId ?? e.id,
      userMessage: {
        id: e.data.userMessageId,
        role: 'user',
        status: 'completed',
        content: [{ type: 'text', text: e.data.userText }],
      },
      assistantMessage: {
        id: e.data.assistantMessageId,
        role: 'assistant',
        status: 'streaming',
        content: [],
        toolCalls: [],
        parts: [],
      },
    },
  }]
}

// --- Context compaction ---
// Manual and auto compaction share the same event types and the same rendering
// entry type; they differ only by the `trigger` field. A compaction is always a
// STANDALONE timeline entry — never embedded inside an assistant message — so it
// reads as a single history boundary (matching the codex `contextCompaction`
// item) rather than splitting an AI message in two.
//
// Lifecycle: a compaction has exactly one entry whose `status` evolves across
// events (`started` -> running, then `completed`/`failed`/`skipped`). Both
// handlers are idempotent upserts keyed by `data.id`, so replaying or
// reordering events never produces duplicate nodes.

function handleCompactionStarted(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'context_compaction.started' }>
  const updated = updateTimelineCompaction(entries, e.data.id, { status: 'running' })
  if (hasCompaction(updated, e.data.id)) return updated
  const compaction: ContextCompaction = {
    id: e.data.id,
    trigger: e.data.trigger,
    status: 'running',
  }
  return [...entries, { type: 'compaction', compaction }]
}

function handleCompactionResolved(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<
    AnyTimelineEvent,
    { type: 'context_compaction.completed' | 'context_compaction.failed' | 'context_compaction.skipped' }
  >
  const update: Partial<ContextCompaction> =
    e.type === 'context_compaction.completed'
      ? {
          status: 'completed',
          compactedItems: e.data.compactedItems,
          keptItems: e.data.keptItems,
          reason: e.data.reason,
        }
      : e.type === 'context_compaction.skipped'
        ? { status: 'skipped', reason: e.data.reason }
        : { status: 'failed', error: e.data.error }

  const updated = updateTimelineCompaction(entries, e.data.id, update)
  if (hasCompaction(updated, e.data.id)) return updated
  return [...updated, {
    type: 'compaction',
    compaction: {
      id: e.data.id,
      trigger: e.data.trigger,
      status: (update.status ?? 'failed') as ContextCompaction['status'],
      ...update,
    },
  }]
}

// --- Message content ---

function handleMessageDelta(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'message.delta' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: appendContent(turn.assistantMessage, { type: 'text', text: e.data.text }),
  }))
}

function handleReasoningDelta(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'reasoning.delta' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: appendContent(turn.assistantMessage, { type: 'reasoning', text: e.data.text }),
  }))
}

// --- Tool calls ---

function handleToolCalled(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.called' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: {
      ...turn.assistantMessage,
      toolCalls: turn.assistantMessage.toolCalls.some((tool) => tool.id === e.data.toolCallId)
        ? turn.assistantMessage.toolCalls
        : [...turn.assistantMessage.toolCalls, { id: e.data.toolCallId, name: e.data.name, args: {}, status: 'running' }],
      parts: turn.assistantMessage.parts.some((part) => part.type === 'tool' && part.callId === e.data.toolCallId)
        ? turn.assistantMessage.parts
        : [...turn.assistantMessage.parts, { type: 'tool', callId: e.data.toolCallId }],
    },
  }))
}

function handleToolArguments(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.arguments' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { args: e.data.args, rawArgs: undefined }),
  }))
}

function handleToolArgumentsDelta(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.arguments.delta' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: (() => {
      const tool = turn.assistantMessage.toolCalls.find((t) => t.id === e.data.toolCallId)
      if (!tool) return turn.assistantMessage
      const prev = tool.rawArgs ?? ''
      return updateToolCall(turn.assistantMessage, e.data.toolCallId, { rawArgs: prev + e.data.delta })
    })(),
  }))
}

function handleToolAwaitingApproval(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.awaiting_approval' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { args: e.data.args, status: 'awaiting_approval' }),
  }))
}

function handleToolApproved(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.approved' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { status: 'running' }),
  }))
}

function handleToolOutput(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.output' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { status: 'completed', result: e.data.result }),
  }))
}

function handleToolDenied(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.denied' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { status: 'denied' }),
  }))
}

function handleToolFailed(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'tool.failed' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: updateToolCall(turn.assistantMessage, e.data.toolCallId, { status: 'failed', error: e.data.error }),
  }))
}

// --- Sub-agents ---

function handleSubagentStarted(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'subagent.started' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => {
    const msg = turn.assistantMessage
    let targetId = msg.toolCalls.find((t) => t.id === e.data.toolCallId)?.id
    if (!targetId) {
      for (let i = msg.toolCalls.length - 1; i >= 0; i -= 1) {
        if (msg.toolCalls[i].status === 'running' && !msg.toolCalls[i].childConversationId) {
          targetId = msg.toolCalls[i].id
          break
        }
      }
    }
    if (!targetId) return turn
    return {
      ...turn,
      assistantMessage: {
        ...msg,
        toolCalls: msg.toolCalls.map((t) => t.id === targetId ? { ...t, childConversationId: e.data.childConversationId } : t),
      },
    }
  })
}

function handleSubagentCompleted(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'subagent.completed' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: {
      ...turn.assistantMessage,
      toolCalls: turn.assistantMessage.toolCalls.map((tool) =>
        tool.childConversationId === e.data.childConversationId ? { ...tool, status: 'completed' } : tool),
    },
  }))
}

// --- Run status ---

function handleRunWaitingApproval(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'run.waiting_approval' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: { ...turn.assistantMessage, status: 'waiting_approval' },
  }))
}

function handleRunStartedOrResumed(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'run.started' | 'run.resumed' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: { ...turn.assistantMessage, status: 'streaming' },
  }))
}

function handleRunCompleted(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'run.completed' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: { ...turn.assistantMessage, status: 'completed' },
  }))
}

function handleRunEndedWithError(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const e = event as Extract<AnyTimelineEvent, { type: 'run.failed' | 'run.cancelled' | 'run.interrupted' }>
  return updateTimelineTurn(entries, e.runId!, (turn) => ({
    ...turn,
    assistantMessage: { ...turn.assistantMessage, status: 'incomplete', error: e.data.error },
  }))
}

// --- Dispatch table ---
// Every timeline event type has exactly one handler. Unknown types fall through
// to the identity transform, keeping the reducer resilient to new events.

export const timelineHandlers: Record<string, Handler> = {
  'turn.started': handleTurnStarted,

  'context_compaction.started': handleCompactionStarted,
  'context_compaction.completed': handleCompactionResolved,
  'context_compaction.failed': handleCompactionResolved,
  'context_compaction.skipped': handleCompactionResolved,

  'message.delta': handleMessageDelta,
  'reasoning.delta': handleReasoningDelta,

  'tool.called': handleToolCalled,
  'tool.arguments': handleToolArguments,
  'tool.arguments.delta': handleToolArgumentsDelta,
  'tool.awaiting_approval': handleToolAwaitingApproval,
  'tool.approved': handleToolApproved,
  'tool.output': handleToolOutput,
  'tool.denied': handleToolDenied,
  'tool.failed': handleToolFailed,

  'subagent.started': handleSubagentStarted,
  'subagent.completed': handleSubagentCompleted,

  'run.waiting_approval': handleRunWaitingApproval,
  'run.started': handleRunStartedOrResumed,
  'run.resumed': handleRunStartedOrResumed,
  'run.completed': handleRunCompleted,
  'run.failed': handleRunEndedWithError,
  'run.cancelled': handleRunEndedWithError,
  'run.interrupted': handleRunEndedWithError,
}

export function applyTimelineEvent(entries: ChatEntry[], event: AnyTimelineEvent): ChatEntry[] {
  const handler = timelineHandlers[event.type]
  return handler ? handler(entries, event) : entries
}

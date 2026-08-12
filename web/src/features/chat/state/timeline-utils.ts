// Shared pure helpers for transforming chat timeline entries.
// No behavior decisions about *which* event maps to *which* change live here —
// that belongs to the timeline handlers. These are the low-level operations
// used by handlers and the chat reducer alike.

import type {
  AssistantMessage,
  ChatEntry,
  ContextCompaction,
  MessageContent,
  ToolCall,
  ToolCallStatus,
  Turn,
} from '../types'
import type { ConversationRuntimeStatus } from '@cloudagent/core'

export const MAX_CONTENT_LEN = 100_000

export function mapTurns(entries: ChatEntry[], update: (turn: Turn) => Turn): ChatEntry[] {
  return entries.map((entry) => entry.type === 'turn' ? { ...entry, turn: update(entry.turn) } : entry)
}

export function appendContent(msg: AssistantMessage, content: MessageContent): AssistantMessage {
  const last = msg.content[msg.content.length - 1]
  const lastPart = msg.parts[msg.parts.length - 1]
  if (content.type === 'text' && last?.type === 'text') {
    const combined = last.text + content.text
    const nextContent = { type: 'text' as const, text: combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined }
    return {
      ...msg,
      content: [...msg.content.slice(0, -1), nextContent],
      parts: lastPart?.type === 'content' && lastPart.content.type === 'text'
        ? [...msg.parts.slice(0, -1), { type: 'content', content: nextContent }]
        : [...msg.parts, { type: 'content', content: nextContent }],
    }
  }
  if (content.type === 'reasoning' && last?.type === 'reasoning') {
    const combined = last.text + content.text
    const nextContent = { type: 'reasoning' as const, text: combined.length > MAX_CONTENT_LEN
      ? combined.slice(0, MAX_CONTENT_LEN) + '\n... [truncated]'
      : combined }
    return {
      ...msg,
      content: [...msg.content.slice(0, -1), nextContent],
      parts: lastPart?.type === 'content' && lastPart.content.type === 'reasoning'
        ? [...msg.parts.slice(0, -1), { type: 'content', content: nextContent }]
        : [...msg.parts, { type: 'content', content: nextContent }],
    }
  }
  return { ...msg, content: [...msg.content, content], parts: [...msg.parts, { type: 'content', content }] }
}

export function updateToolCall(msg: AssistantMessage, callId: string, update: Partial<ToolCall>): AssistantMessage {
  return { ...msg, toolCalls: msg.toolCalls.map((tool) => tool.id === callId ? { ...tool, ...update } : tool) }
}

export function isTerminal(status: ToolCallStatus) {
  return status === 'completed' || status === 'denied' || status === 'failed' || status === 'incomplete'
}

export function deriveMessageStatus(msg: AssistantMessage): AssistantMessage['status'] {
  if (msg.toolCalls.some((tool) => tool.status === 'awaiting_approval')) return 'waiting_approval'
  if (msg.toolCalls.length > 0 && msg.toolCalls.every((tool) => isTerminal(tool.status)) && msg.content.length > 0) return 'completed'
  return 'streaming'
}

export function isActiveRuntimeStatus(status: ConversationRuntimeStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_approval'
}

export function runtimeStatusFromEntries(entries: ChatEntry[]): ConversationRuntimeStatus {
  const latestTurn = [...entries].reverse().find((entry) => entry.type === 'turn')
  if (latestTurn?.type !== 'turn') return 'idle'
  if (latestTurn.turn.assistantMessage.status === 'waiting_approval') return 'waiting_approval'
  if (latestTurn.turn.assistantMessage.status === 'streaming') return 'running'
  return 'idle'
}

// --- Compaction entry helpers ---
// A compaction is always a standalone `compaction` entry in the timeline, never
// embedded inside an assistant message part. This keeps it as a clean history
// boundary (matching the codex ContextCompaction item) and avoids splitting a
// single AI message visually.

export function hasCompaction(entries: ChatEntry[], id: string) {
  return entries.some((entry) => entry.type === 'compaction' && entry.compaction.id === id)
}

export function updateTimelineTurn(
  entries: ChatEntry[],
  runId: string,
  update: (turn: Turn) => Turn,
): ChatEntry[] {
  return entries.map((entry) => entry.type === 'turn' && entry.turn.id === runId
    ? { ...entry, turn: update(entry.turn) }
    : entry)
}

export function updateTimelineCompaction(
  entries: ChatEntry[],
  id: string,
  update: Partial<ContextCompaction>,
): ChatEntry[] {
  return entries.map((entry) => entry.type === 'compaction' && entry.compaction.id === id
    ? { ...entry, compaction: { ...entry.compaction, ...update } }
    : entry)
}

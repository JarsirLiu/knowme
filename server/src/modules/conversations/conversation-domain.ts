import type { Conversation } from '@prisma/client'
import type { ConversationRuntimeStatus } from '@superagent/core'

export const ACTIVE_RUN_STATUSES: string[] = ['queued', 'running', 'waiting_approval']

export function isActiveRun(status: string): boolean {
  return (ACTIVE_RUN_STATUSES as readonly string[]).includes(status)
}

export const ACTIVE_RUNTIME_STATUSES: ConversationRuntimeStatus[] = [
  'running',
  'waiting_approval',
  'queued',
]

export function isRuntimeStatusRunning(status: ConversationRuntimeStatus): boolean {
  return ACTIVE_RUNTIME_STATUSES.includes(status)
}

export function isConversationAlive(status: string): boolean {
  return status === 'active'
}

export function runtimeStatusForRuns(runs: Array<{ status: string }> | undefined): ConversationRuntimeStatus {
  if (!runs || runs.length === 0) return 'idle'
  if (runs.some((run) => run.status === 'running')) return 'running'
  if (runs.some((run) => run.status === 'waiting_approval')) return 'waiting_approval'
  if (runs.some((run) => run.status === 'queued')) return 'queued'
  const latest = runs[0]?.status
  if (latest === 'failed' || latest === 'interrupted' || latest === 'cancelled') return latest
  return 'idle'
}

export function withRuntimeStatus(
  conversation: Omit<Conversation, 'runs'>,
  runs: Array<{ status: string }>,
) {
  return {
    ...conversation,
    runtimeStatus: runtimeStatusForRuns(runs),
  }
}

export function titleFromMessage(message: string): string {
  const title = message.replace(/\s+/g, ' ').trim()
  if (!title) return 'New Task'
  return title.length > 64 ? `${title.slice(0, 61)}...` : title
}
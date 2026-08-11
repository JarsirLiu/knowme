import type { Conversation } from '@prisma/client'
import type { ConversationRuntimeStatus } from '@cloudagent/core'

export function runtimeStatusForRuns(runs: Array<{ status: string }>): ConversationRuntimeStatus {
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
import { randomUUID } from 'node:crypto'
import {
  SessionCompactionService,
  type CompactionObserver,
  type SessionCompactionOptions,
  type SessionCompactionResult,
  type SessionCompactionTrigger,
} from './session-compaction.js'

export class SessionCompactionCoordinator {
  private readonly service: SessionCompactionService

  constructor(
    private readonly sessionId: string,
    private readonly options: SessionCompactionOptions | undefined,
    private readonly observer?: CompactionObserver,
    service: SessionCompactionService = new SessionCompactionService(),
  ) {
    this.service = service
  }

  async compact(trigger: SessionCompactionTrigger): Promise<SessionCompactionResult> {
    if (!this.options) return skippedCompaction(trigger)

    const id = randomUUID()
    let started = false
    try {
      const result = await this.service.compact(this.sessionId, this.options, trigger, {
        beforeCompaction: async () => {
          started = true
          await this.observer?.started?.({ id, trigger })
        },
      })
      if (result.status === 'compacted') await this.observer?.completed?.({ id, trigger, result })
      return result
    } catch (error) {
      if (started) {
        await this.observer?.failed?.({
          id,
          trigger,
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined)
      }
      throw error
    }
  }

  // Runs only the compaction lifecycle (started -> completed/failed) and returns
  // the result. Persisting the compaction message is left to the caller (the
  // session layer), keeping this coordinator free of storage concerns.
  async runAutoCompaction(): Promise<SessionCompactionResult | null> {
    if (!this.options) return null

    try {
      return await this.compact('auto')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[context-compaction] skipped:', message)
      return null
    }
  }
}

function skippedCompaction(trigger: SessionCompactionTrigger): SessionCompactionResult {
  return {
    status: 'skipped',
    trigger,
    reason: 'compaction not configured',
    beforeItems: 0,
    afterItems: 0,
    compactedItems: 0,
    keptItems: 0,
    estimatedTokensBefore: 0,
    estimatedTokensAfter: 0,
    predictedInputTokens: 0,
    inputBudgetTokens: 0,
    recentTokenBudget: 0,
  }
}

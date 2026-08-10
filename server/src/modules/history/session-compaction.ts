import type { AgentInputItem } from '@openai/agents'
import { estimateTokens } from './token-estimator.js'
import {
  createCompactionBudget,
  createSummaryItem,
  isReasoningItem,
  selectManualCompactionRange,
  selectRecentTail,
  skipped,
  type SessionCompactionResult,
  type SessionCompactionTrigger,
} from './compaction-policy.js'
import {
  type ContextSummarizer,
} from './context-summarizer.js'
import {
  loadSessionCompactionOptions,
  type SessionCompactionOptions,
} from './compaction-config.js'
import {
  PrismaSessionCompactionRepository,
  type SessionCompactionRepository,
} from './session-compaction-repository.js'

export type { ContextSummarizer } from './context-summarizer.js'
export type {
  SessionCompactionResult,
  SessionCompactionTrigger,
} from './compaction-policy.js'
export {
  loadSessionCompactionOptions,
  type SessionCompactionOptions,
} from './compaction-config.js'

export interface CompactionObserver {
  started?: (input: { id: string; trigger: SessionCompactionTrigger }) => Promise<void>
  completed?: (input: { id: string; trigger: SessionCompactionTrigger; result: SessionCompactionResult }) => Promise<void>
  failed?: (input: { id: string; trigger: SessionCompactionTrigger; error: string }) => Promise<void>
}

export interface CompactionHooks {
  beforeCompaction?: () => Promise<void>
}

export class SessionCompactionService {
  constructor(
    private readonly repository: SessionCompactionRepository = new PrismaSessionCompactionRepository(),
  ) {}

  async compact(
    sessionId: string,
    options: SessionCompactionOptions,
    trigger: SessionCompactionTrigger,
    hooks?: CompactionHooks,
  ): Promise<SessionCompactionResult> {
    const items = await this.repository.readItems(sessionId)
    const force = trigger === 'manual'
    const budget = createCompactionBudget(options)
    const estimatedTokensBefore = estimateTokens(items)
    const baseline = await this.repository.readUsageBaseline(sessionId)
    const predictedInputTokens = baseline
      ? Math.max(0, baseline.inputTokens + estimatedTokensBefore - baseline.estimatedTokens)
      : estimatedTokensBefore

    if (!force && !options.enabled) {
      return skipped(trigger, 'auto compaction disabled', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
    }
    if (!force && predictedInputTokens < budget.compactBefore) {
      return skipped(trigger, 'context token budget not reached', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
    }

    const selection = force
      ? selectManualCompactionRange(items)
      : selectRecentTail(items, options.keepRecentTokens)
    if (!selection) {
      const reason = force
        ? 'no historical turn available to compact'
        : 'no complete historical turn fits the recent token budget'
      return skipped(trigger, reason, items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
    }

    const compactedItems = selection.compactedItems
    if (compactedItems.length === 0) {
      return skipped(trigger, 'no historical turn available to compact', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
    }

    await hooks?.beforeCompaction?.()

    const summaryItems = compactedItems.filter((item: AgentInputItem) => !isReasoningItem(item))
    const summary = await options.summarizer.summarize({
      items: summaryItems,
      maxPromptChars: options.maxPromptChars,
    })
    const summaryItem = createSummaryItem(summary, {
      trigger,
      compactedItems: compactedItems.length,
      keptItems: selection.keptItems.length,
    })
    const replacement = [summaryItem, ...selection.keptItems]

    await this.repository.replaceItems(sessionId, replacement)

    return {
      status: 'compacted',
      trigger,
      beforeItems: items.length,
      afterItems: replacement.length,
      compactedItems: compactedItems.length,
      keptItems: selection.keptItems.length,
      summary,
      estimatedTokensBefore,
      estimatedTokensAfter: estimateTokens(replacement),
      predictedInputTokens,
      ...(baseline ? { confirmedInputTokens: baseline.inputTokens } : {}),
      inputBudgetTokens: budget.inputBudgetTokens,
      recentTokenBudget: force ? 0 : options.keepRecentTokens,
    }
  }

  async persistCompactionMessage(sessionId: string, result: SessionCompactionResult) {
    return this.repository.persistCompactionMessage(sessionId, result)
  }
}

export async function compactSession(
  sessionId: string,
  options: SessionCompactionOptions,
  trigger: SessionCompactionTrigger,
  hooks?: CompactionHooks,
  repository: SessionCompactionRepository = new PrismaSessionCompactionRepository(),
) {
  return new SessionCompactionService(repository).compact(sessionId, options, trigger, hooks)
}

export async function persistCompactionMessage(
  sessionId: string,
  result: SessionCompactionResult,
  repository: SessionCompactionRepository = new PrismaSessionCompactionRepository(),
) {
  return repository.persistCompactionMessage(sessionId, result)
}

export async function replaceSessionItems(
  sessionId: string,
  items: AgentInputItem[],
  repository: SessionCompactionRepository = new PrismaSessionCompactionRepository(),
) {
  return repository.replaceItems(sessionId, items)
}

export { estimateTokens }

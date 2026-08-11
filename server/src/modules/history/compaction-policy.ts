import type { AgentInputItem } from '@openai/agents'
import { randomUUID } from 'node:crypto'

export type SessionCompactionTrigger = 'auto' | 'manual'

export interface CompactionPolicyOptions {
  enabled: boolean
  contextWindowTokens: number
  outputReserveTokens: number
  safetyMarginTokens: number
  triggerRatio: number
  keepRecentTokens: number
  maxPromptChars: number
  /** Fixed input overhead (system prompt + tool definitions) not stored in session items. */
  baseTokens?: number
  /** Fraction of the context window that forces compaction as a safety net. */
  forceCompactRatio?: number
}

export interface SessionCompactionResult {
  status: 'compacted' | 'skipped' | 'failed'
  trigger: SessionCompactionTrigger
  reason?: string
  beforeItems: number
  afterItems: number
  compactedItems: number
  keptItems: number
  summary?: string
  estimatedTokensBefore: number
  estimatedTokensAfter: number
  predictedInputTokens: number
  confirmedInputTokens?: number
  inputBudgetTokens: number
  hardLimitTokens: number
  baseTokens: number
  recentTokenBudget: number
}

export function createCompactionBudget(options: CompactionPolicyOptions) {
  const inputBudgetTokens = Math.max(
    1,
    options.contextWindowTokens - options.outputReserveTokens - options.safetyMarginTokens,
  )
  return {
    inputBudgetTokens,
    compactBefore: Math.max(1, Math.floor(inputBudgetTokens * options.triggerRatio)),
  }
}

export function createHardLimit(options: CompactionPolicyOptions): number {
  return Math.max(1, Math.floor(options.contextWindowTokens * (options.forceCompactRatio ?? 0.95)))
}

export function computePredictedInputTokens(input: {
  estimatedTokensBefore: number
  baseTokens: number
  baseline?: { inputTokens: number; estimatedTokens: number }
}): number {
  const effectiveTokensBefore = input.estimatedTokensBefore + input.baseTokens
  return input.baseline
    ? Math.max(0, input.baseline.inputTokens + input.estimatedTokensBefore - input.baseline.estimatedTokens)
    : effectiveTokensBefore
}

export function shouldCompact(input: {
  predictedInputTokens: number
  compactBefore: number
  hardLimitTokens: number
  force: boolean
  enabled: boolean
}): { shouldCompact: boolean; reason?: string } {
  if (input.force) return { shouldCompact: true }
  if (!input.enabled && input.predictedInputTokens < input.hardLimitTokens) {
    return { shouldCompact: false, reason: 'auto compaction disabled' }
  }
  if (input.predictedInputTokens < input.compactBefore && input.predictedInputTokens < input.hardLimitTokens) {
    return { shouldCompact: false, reason: 'context token budget not reached' }
  }
  return { shouldCompact: true }
}

export function selectRecentTail(items: AgentInputItem[], keepRecentTokens: number) {
  const userStarts = items.flatMap((item, index) => isUserMessage(item) ? [index] : [])
  if (userStarts.length === 0) return undefined

  let startIndex = items.length
  let recentTokens = 0
  for (let turnIndex = userStarts.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turnStart = userStarts[turnIndex]
    const candidateTokens = estimateTokens(items.slice(turnStart))
    if (recentTokens > 0 && candidateTokens > keepRecentTokens) break
    if (recentTokens === 0 && candidateTokens > keepRecentTokens) return undefined
    startIndex = turnStart
    recentTokens = candidateTokens
  }

  if (startIndex === items.length || startIndex === 0) return undefined
  return {
    startIndex,
    recentItems: items.slice(startIndex),
    recentTokens,
  }
}

export function createSummaryItem(
  summary: string,
  metadata: {
    trigger: SessionCompactionTrigger
    compactedItems: number
    keptItems: number
  },
): AgentInputItem {
  return {
    type: 'message',
    role: 'system',
    content:
      'Earlier conversation context was compacted (' + metadata.compactedItems + ' items). ' +
      'Use this summary as authoritative prior context:\n\n' +
      summary,
    providerData: {
      cloudagent: {
        kind: 'context_compaction',
        id: randomUUID(),
        trigger: metadata.trigger,
        compactedItems: metadata.compactedItems,
        keptItems: metadata.keptItems,
        compactedAt: new Date().toISOString(),
      },
    },
  } as unknown as AgentInputItem
}

export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : stringify(value)
  let tokens = 0
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x7f) tokens += /[\s]/u.test(character) ? 0.25 : 0.34
    else if (code >= 0x2e80 && code <= 0x9fff) tokens += 0.75
    else if (code >= 0xf900 && code <= 0xfaff) tokens += 0.75
    else if (code >= 0x20000 && code <= 0x3134f) tokens += 0.75
    else tokens += 0.75
  }
  return Math.max(1, Math.ceil(tokens))
}

export function isReasoningItem(item: AgentInputItem): boolean {
  const record = item as Record<string, unknown>
  return record.type === 'reasoning' || record.type === 'reasoning_item'
}

export function skipped(
  trigger: SessionCompactionTrigger,
  reason: string,
  itemCount: number,
  estimatedTokensBefore: number,
  predictedInputTokens: number,
  budget: { inputBudgetTokens: number; compactBefore: number },
  hardLimitTokens: number,
  baseTokens: number,
  baseline?: { inputTokens: number; estimatedTokens: number },
): SessionCompactionResult {
  return {
    status: 'skipped',
    trigger,
    reason,
    beforeItems: itemCount,
    afterItems: itemCount,
    compactedItems: 0,
    keptItems: itemCount,
    estimatedTokensBefore,
    estimatedTokensAfter: estimatedTokensBefore,
    predictedInputTokens,
    ...(baseline ? { confirmedInputTokens: baseline.inputTokens } : {}),
    inputBudgetTokens: budget.inputBudgetTokens,
    hardLimitTokens,
    baseTokens,
    recentTokenBudget: 0,
  }
}

function isUserMessage(item: AgentInputItem): boolean {
  const record = item as Record<string, unknown>
  return record.type === 'message' && record.role === 'user'
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createCompactionBudget,
  createHardLimit,
  computePredictedInputTokens,
  shouldCompact,
  createSummaryItem,
  selectRecentTail,
  estimateTokens,
} from '../src/modules/history/compaction-policy.js'

const EMPTY_OPTIONS = {
  enabled: true,
  contextWindowTokens: 100_000,
  outputReserveTokens: 10_000,
  safetyMarginTokens: 1_000,
  triggerRatio: 0.9,
  keepRecentTokens: 20_000,
  maxPromptChars: 50_000,
}

describe('createCompactionBudget', () => {
  it('computes input budget and compact-before threshold', () => {
    const budget = createCompactionBudget(EMPTY_OPTIONS)
    // inputBudget = 100000 - 10000 - 1000 = 89000
    assert.equal(budget.inputBudgetTokens, 89_000)
    // compactBefore = floor(89000 * 0.9) = 80100
    assert.equal(budget.compactBefore, 80_100)
  })

  it('guards against zero or negative values', () => {
    const budget = createCompactionBudget({
      ...EMPTY_OPTIONS,
      contextWindowTokens: 100,
      outputReserveTokens: 200,
      safetyMarginTokens: 50,
    })
    // inputBudget = max(1, 100 - 200 - 50) = 1
    assert.equal(budget.inputBudgetTokens, 1)
    assert.equal(budget.compactBefore, 1)
  })
})

describe('createHardLimit', () => {
  it('uses default ratio 0.95 when forceCompactRatio is not set', () => {
    const limit = createHardLimit(EMPTY_OPTIONS)
    // 100000 * 0.95 = 95000
    assert.equal(limit, 95_000)
  })

  it('uses the configured ratio', () => {
    const limit = createHardLimit({ ...EMPTY_OPTIONS, forceCompactRatio: 0.98 })
    assert.equal(limit, 98_000)
  })

  it('guards against zero', () => {
    const limit = createHardLimit({
      ...EMPTY_OPTIONS,
      contextWindowTokens: 1,
      forceCompactRatio: 0.5,
    })
    assert.equal(limit, 1)
  })
})

describe('computePredictedInputTokens', () => {
  it('when no baseline, adds baseTokens to the estimate', () => {
    const result = computePredictedInputTokens({
      estimatedTokensBefore: 50_000,
      baseTokens: 3_000,
    })
    // 50000 + 3000 = 53000
    assert.equal(result, 53_000)
  })

  it('when no baseline and baseTokens is 0, returns estimatedTokensBefore', () => {
    const result = computePredictedInputTokens({
      estimatedTokensBefore: 50_000,
      baseTokens: 0,
    })
    assert.equal(result, 50_000)
  })

  it('when baseline exists, uses API inputTokens as anchor (baseTokens cancels out)', () => {
    const result = computePredictedInputTokens({
      estimatedTokensBefore: 60_000,
      baseTokens: 3_000,
      baseline: {
        inputTokens: 53_000,  // API says: items_old(50000) + overhead(3000) = 53000
        estimatedTokens: 50_000,  // local estimate: items_old only
      },
    })
    // 53000 + 60000 - 50000 = 63000
    assert.equal(result, 63_000)
  })

  it('guards against negative predicted tokens', () => {
    const result = computePredictedInputTokens({
      estimatedTokensBefore: 100,
      baseTokens: 0,
      baseline: { inputTokens: 50, estimatedTokens: 200 },
    })
    // max(0, 50 + 100 - 200) = 0
    assert.equal(result, 0)
  })
})

describe('shouldCompact', () => {
  const BUDGET = createCompactionBudget(EMPTY_OPTIONS)
  const HARD_LIMIT = createHardLimit(EMPTY_OPTIONS)
  // BUDGET.compactBefore = 80100, HARD_LIMIT = 95000

  it('force=true always compacts', () => {
    assert.equal(shouldCompact({
      predictedInputTokens: 0,
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: true,
      enabled: false,
    }).shouldCompact, true)
  })

  it('below compactBefore and hardLimit: skip', () => {
    const decision = shouldCompact({
      predictedInputTokens: 50_000,
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: false,
      enabled: true,
    })
    assert.equal(decision.shouldCompact, false)
    assert.equal(decision.reason, 'context token budget not reached')
  })

  it('at compactBefore but below hardLimit: compact', () => {
    assert.equal(shouldCompact({
      predictedInputTokens: 85_000,  // > 80100
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: false,
      enabled: true,
    }).shouldCompact, true)
  })

  it('at hardLimit but below compactBefore: compact (hard limit safety net)', () => {
    assert.equal(shouldCompact({
      predictedInputTokens: 96_000,  // > 95000, but 96000 > 80100 so also > compactBefore
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: false,
      enabled: true,
    }).shouldCompact, true)
  })

  it('auto-compact disabled but below hard limit: skip', () => {
    const decision = shouldCompact({
      predictedInputTokens: 90_000,
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: false,
      enabled: false,
    })
    assert.equal(decision.shouldCompact, false)
    assert.equal(decision.reason, 'auto compaction disabled')
  })

  it('auto-compact disabled but at hard limit: compact (safety net)', () => {
    assert.equal(shouldCompact({
      predictedInputTokens: 96_000,
      compactBefore: BUDGET.compactBefore,
      hardLimitTokens: HARD_LIMIT,
      force: false,
      enabled: false,
    }).shouldCompact, true)
  })
})

describe('selectRecentTail', () => {
  function userMsg(id: string) {
    return { type: 'message', role: 'user', content: [{ type: 'input_text', text: id }] } as any
  }
  function asstMsg(id: string) {
    return { type: 'message', role: 'assistant', content: [{ type: 'input_text', text: id }] } as any
  }

  it('returns undefined when no user message exists', () => {
    assert.equal(selectRecentTail([asstMsg('a'), asstMsg('b')], 100), undefined)
  })

  it('returns undefined when the first turn already exceeds the budget', () => {
    const selection = selectRecentTail([userMsg('x'.repeat(5000))], 10)
    assert.equal(selection, undefined)
  })

  it('returns undefined when the tail captures everything (nothing to compact)', () => {
    // Each turn is ~50 tokens, so 3 turns = ~150 tokens.
    // With keepRecent=200, the tail captures all items → undefined.
    const items = [
      userMsg('turn-a'), asstMsg('resp-a'),
      userMsg('turn-b'), asstMsg('resp-b'),
      userMsg('turn-c'), asstMsg('resp-c'),
    ]
    assert.equal(selectRecentTail(items, 200), undefined)
  })

  it('selects trailing turns, leaving earlier ones to compact', () => {
    // Each turn is ~50 tokens. With keepRecent=70, only the last turn fits.
    const items = [
      userMsg('turn-a---padding-to-make-this-turn-big'), asstMsg('resp-a'),
      userMsg('turn-b'), asstMsg('resp-b'),
      userMsg('turn-c'), asstMsg('resp-c'),
    ]
    const selection = selectRecentTail(items, 70)
    assert.ok(selection)
    assert.equal(selection.recentItems.length, 2) // last turn only
    assert.equal(selection.startIndex, 4)
  })
})

describe('estimateTokens', () => {
  it('returns at least 1 for empty input', () => {
    assert.equal(estimateTokens(''), 1)
  })

  it('counts ASCII whitespace at 0.25 tokens/char', () => {
    // 4 spaces = 4 * 0.25 = 1 token
    assert.equal(estimateTokens('    '), 1)
  })

  it('counts ASCII non-whitespace at 0.34 tokens/char', () => {
    // 3 chars = 3 * 0.34 = 1.02 → ceil 2
    assert.equal(estimateTokens('abc'), 2)
  })

  it('counts CJK characters at 0.75 tokens/char', () => {
    // 2 CJK chars = 2 * 0.75 = 1.5 → ceil 2
    assert.equal(estimateTokens('中文'), 2)
  })
})

describe('createSummaryItem', () => {
  it('creates a system message with compaction metadata', () => {
    const item = createSummaryItem('test summary', {
      trigger: 'auto',
      compactedItems: 5,
      keptItems: 3,
    })
    const record = item as any
    assert.equal(record.type, 'message')
    assert.equal(record.role, 'system')
    assert.ok(record.content.includes('test summary'))
    assert.equal(record.providerData.cloudagent.kind, 'context_compaction')
    assert.equal(record.providerData.cloudagent.trigger, 'auto')
    assert.equal(record.providerData.cloudagent.compactedItems, 5)
  })
})
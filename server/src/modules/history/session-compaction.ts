import type { AgentInputItem } from '@openai/agents'
import { loadConfig } from '@superagent/agent'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../db/client.js'

export interface ContextSummarizer {
  summarize(input: { items: AgentInputItem[]; maxPromptChars: number }): Promise<string>
}

export interface SessionCompactionOptions {
  enabled: boolean
  contextWindowTokens: number
  outputReserveTokens: number
  safetyMarginTokens: number
  triggerRatio: number
  keepRecentTokens: number
  maxPromptChars: number
  summarizer: ContextSummarizer
}

export type SessionCompactionTrigger = 'auto' | 'manual'

export interface SessionCompactionResult {
  status: 'compacted' | 'skipped' | 'failed'
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
  recentTokenBudget: number
}

export class OpenAICompatibleContextSummarizer implements ContextSummarizer {
  constructor(
    private readonly cfg: {
      baseURL: string
      apiKey: string
      model: string
      maxOutputTokens: number
    },
  ) {}

  async summarize(input: { items: AgentInputItem[]; maxPromptChars: number }): Promise<string> {
    const response = await fetch(this.chatCompletionsUrl(), {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + this.cfg.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.cfg.model,
        stream: false,
        temperature: 0,
        max_tokens: this.cfg.maxOutputTokens,
        messages: [
          {
            role: 'system',
            content:
              'You compact long coding-agent conversations. Preserve user goals, project facts, decisions, modified files, commands, tool results, current plan, blockers, and unresolved risks. Be concise and factual.',
          },
          {
            role: 'user',
            content: buildCompactionPrompt(input.items, input.maxPromptChars),
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error('Context compaction failed (' + response.status + '): ' + body.slice(0, 500))
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const summary = payload.choices?.[0]?.message?.content?.trim()
    if (!summary) throw new Error('Context compaction returned an empty summary')
    return summary
  }

  private chatCompletionsUrl() {
    return this.cfg.baseURL.replace(/\/+$/, '') + '/chat/completions'
  }
}

export function loadSessionCompactionOptions(): SessionCompactionOptions {
  const cfg = loadConfig()
  return {
    enabled: readBooleanEnv('SUPERAGENT_CONTEXT_AUTO_COMPACT', true),
    contextWindowTokens: readNumberEnv('SUPERAGENT_CONTEXT_WINDOW_TOKENS', 64000),
    outputReserveTokens: readNumberEnv('SUPERAGENT_CONTEXT_OUTPUT_RESERVE_TOKENS', 16000),
    safetyMarginTokens: readNumberEnv('SUPERAGENT_CONTEXT_SAFETY_MARGIN_TOKENS', 1024),
    triggerRatio: readRatioEnv('SUPERAGENT_CONTEXT_COMPACT_TRIGGER_RATIO', 0.9),
    keepRecentTokens: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_KEEP_TOKENS', 20000),
    maxPromptChars: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_MAX_CHARS', 50000),
    summarizer: new OpenAICompatibleContextSummarizer({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      maxOutputTokens: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_MAX_TOKENS', 1200),
    }),
  }
}

export async function compactSession(
  sessionId: string,
  options: SessionCompactionOptions,
  trigger: SessionCompactionTrigger,
): Promise<SessionCompactionResult> {
  const items = await readSessionItems(sessionId)
  const force = trigger === 'manual'
  const budget = createBudget(options)
  const estimatedTokensBefore = estimateTokens(items)
  const baseline = await readUsageBaseline(sessionId)
  const predictedInputTokens = baseline
    ? Math.max(0, baseline.inputTokens + estimatedTokensBefore - baseline.estimatedTokens)
    : estimatedTokensBefore

  if (!force && !options.enabled) {
    return skipped('auto compaction disabled', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
  }
  if (!force && predictedInputTokens < budget.compactBefore) {
    return skipped('context token budget not reached', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
  }

  const selection = selectRecentTail(items, options.keepRecentTokens)
  if (!selection) {
    return skipped('no complete historical turn fits the recent token budget', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
  }

  const compactedItems = items.slice(0, selection.startIndex)
  if (compactedItems.length === 0) {
    return skipped('no historical turn available to compact', items.length, estimatedTokensBefore, predictedInputTokens, budget, baseline)
  }

  const summary = await options.summarizer.summarize({
    items: compactedItems,
    maxPromptChars: options.maxPromptChars,
  })
  const summaryItem = createSummaryItem(summary, {
    trigger,
    compactedItems: compactedItems.length,
    keptItems: selection.recentItems.length,
  })
  const replacement = [summaryItem, ...selection.recentItems]

  await replaceSessionItems(sessionId, replacement)

  return {
    status: 'compacted',
    beforeItems: items.length,
    afterItems: replacement.length,
    compactedItems: compactedItems.length,
    keptItems: selection.recentItems.length,
    summary,
    estimatedTokensBefore,
    estimatedTokensAfter: estimateTokens(replacement),
    predictedInputTokens,
    ...(baseline ? { confirmedInputTokens: baseline.inputTokens } : {}),
    inputBudgetTokens: budget.inputBudgetTokens,
    recentTokenBudget: options.keepRecentTokens,
  }
}

export async function replaceSessionItems(sessionId: string, items: AgentInputItem[]) {
  await prisma.$transaction(async (tx) => {
    await tx.sessionItem.deleteMany({ where: { sessionId } })
    for (const [index, item] of items.entries()) {
      await tx.sessionItem.create({
        data: {
          sessionId,
          sequence: index + 1,
          itemType: String(item.type),
          payload: JSON.stringify(item),
        },
      })
    }
  })
}

async function readSessionItems(sessionId: string): Promise<AgentInputItem[]> {
  const rows = await prisma.sessionItem.findMany({
    where: { sessionId },
    orderBy: { sequence: 'asc' },
  })
  return rows.map((row) => JSON.parse(row.payload) as AgentInputItem)
}

async function readUsageBaseline(
  sessionId: string,
): Promise<{ inputTokens: number; estimatedTokens: number } | undefined> {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { conversationId: true },
  })
  if (!session) return undefined

  const event = await prisma.runEvent.findFirst({
    where: {
      type: 'run.usage',
      run: { conversationId: session.conversationId },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!event) return undefined

  try {
    const payload = JSON.parse(event.payload) as Record<string, unknown>
    const inputTokens = Number(payload.inputTokens)
    const estimatedTokens = Number(payload.estimatedTokens)
    if (!Number.isFinite(inputTokens) || !Number.isFinite(estimatedTokens)) return undefined
    return { inputTokens, estimatedTokens }
  } catch {
    return undefined
  }
}

function createBudget(options: SessionCompactionOptions) {
  const inputBudgetTokens = Math.max(
    1,
    options.contextWindowTokens - options.outputReserveTokens - options.safetyMarginTokens,
  )
  return {
    inputBudgetTokens,
    compactBefore: Math.max(1, Math.floor(inputBudgetTokens * options.triggerRatio)),
  }
}

function selectRecentTail(items: AgentInputItem[], keepRecentTokens: number) {
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

function isUserMessage(item: AgentInputItem): boolean {
  const record = item as Record<string, unknown>
  return record.type === 'message' && record.role === 'user'
}

function createSummaryItem(
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
      superagent: {
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

function buildCompactionPrompt(items: AgentInputItem[], maxPromptChars: number): string {
  const lines = items.map((item, index) => String(index + 1) + '. ' + formatItemForSummary(item))
  const body = truncateMiddle(lines.join('\n'), maxPromptChars)
  return [
    'Compact the following earlier session items into a durable summary for a coding agent.',
    'Do not invent facts. Keep concrete paths, commands, errors, design decisions, and pending tasks.',
    '',
    body,
  ].join('\n')
}

function formatItemForSummary(item: AgentInputItem): string {
  const record = item as Record<string, unknown>
  if (record.type === 'message') {
    return String(record.role ?? 'unknown') + ': ' + extractMessageText(record.content)
  }
  if (record.type === 'function_call') {
    return 'tool_call ' + String(record.name ?? 'unknown') + ': ' + truncateMiddle(String(record.arguments ?? ''), 1200)
  }
  if (record.type === 'function_call_result') {
    return 'tool_result ' + String(record.callId ?? record.call_id ?? 'unknown') + ': ' + truncateMiddle(String(record.output ?? ''), 1200)
  }
  return truncateMiddle(JSON.stringify(item), 1200)
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return truncateMiddle(content, 1200)
  if (!Array.isArray(content)) return truncateMiddle(JSON.stringify(content), 1200)
  return truncateMiddle(content.map((part) => {
    if (!part || typeof part !== 'object') return String(part)
    const record = part as Record<string, unknown>
    return String(record.text ?? record.content ?? JSON.stringify(record))
  }).join('\n'), 1200)
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const half = Math.max(1, Math.floor((maxChars - 32) / 2))
  return value.slice(0, half) + '\n...[truncated]...\n' + value.slice(-half)
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

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

function skipped(
  reason: string,
  itemCount: number,
  estimatedTokensBefore: number,
  predictedInputTokens: number,
  budget: { inputBudgetTokens: number; compactBefore: number },
  baseline?: { inputTokens: number; estimatedTokens: number },
): SessionCompactionResult {
  return {
    status: 'skipped',
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
    recentTokenBudget: 0,
  }
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readNumberEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : defaultValue
}

function readRatioEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : defaultValue
}

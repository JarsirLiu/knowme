import type { AgentInputItem } from '@openai/agents'
import { loadConfig } from '@superagent/agent'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../db/client.js'

export interface ContextSummarizer {
  summarize(input: { items: AgentInputItem[]; maxPromptChars: number }): Promise<string>
}

export interface SessionCompactionOptions {
  enabled: boolean
  itemThreshold: number
  keepRecentItems: number
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
    itemThreshold: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_ITEM_THRESHOLD', 80),
    keepRecentItems: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_KEEP_RECENT', 24),
    maxPromptChars: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_MAX_CHARS', 12000),
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
  if (!force && !options.enabled) return skipped('auto compaction disabled', items.length)
  if (!force && items.length < options.itemThreshold) {
    return skipped('item threshold not reached', items.length)
  }

  const keepRecentItems = Math.max(1, options.keepRecentItems)
  if (items.length <= keepRecentItems + 1) {
    return skipped('not enough history to compact', items.length)
  }

  const compactedItems = items.slice(0, -keepRecentItems)
  const recentItems = items.slice(-keepRecentItems)
  const summary = await options.summarizer.summarize({
    items: compactedItems,
    maxPromptChars: options.maxPromptChars,
  })

  const summaryItem = createSummaryItem(summary, {
    trigger,
    compactedItems: compactedItems.length,
    keptItems: recentItems.length,
  })
  const replacement = [summaryItem, ...recentItems]

  await replaceSessionItems(sessionId, replacement)

  return {
    status: 'compacted',
    beforeItems: items.length,
    afterItems: replacement.length,
    compactedItems: compactedItems.length,
    keptItems: recentItems.length,
    summary,
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

  return truncateMiddle(
    content.map((part) => {
      if (!part || typeof part !== 'object') return String(part)
      const record = part as Record<string, unknown>
      return String(record.text ?? record.content ?? JSON.stringify(record))
    }).join('\n'),
    1200,
  )
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const half = Math.max(1, Math.floor((maxChars - 32) / 2))
  return value.slice(0, half) + '\n...[truncated]...\n' + value.slice(-half)
}

async function readSessionItems(sessionId: string): Promise<AgentInputItem[]> {
  const rows = await prisma.sessionItem.findMany({
    where: { sessionId },
    orderBy: { sequence: 'asc' },
  })
  return rows.map((row) => JSON.parse(row.payload) as AgentInputItem)
}

function skipped(reason: string, itemCount: number): SessionCompactionResult {
  return {
    status: 'skipped',
    reason,
    beforeItems: itemCount,
    afterItems: itemCount,
    compactedItems: 0,
    keptItems: itemCount,
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

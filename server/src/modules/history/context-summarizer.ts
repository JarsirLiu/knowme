import type { AgentInputItem } from '@openai/agents'

export interface ContextSummarizer {
  summarize(input: { items: AgentInputItem[]; maxPromptChars: number }): Promise<string>
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
              'You compact long coding-agent conversations into a durable summary that will replace the earlier history. ' +
              'Preserve verbatim where possible: the user goal and acceptance criteria, key decisions and their rationale, ' +
              'files that were created or modified (with paths), commands run and their effects, important tool results and errors, ' +
              'the current plan and remaining steps, and any unresolved risks or blockers. ' +
              'Do not invent facts. Be concise, factual, and use short bullet lists. Keep concrete paths, commands, and error messages.',
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

export function buildCompactionPrompt(items: AgentInputItem[], maxPromptChars: number): string {
  const lines = items
    .map((item) => formatItemForSummary(item))
    .filter((line): line is string => Boolean(line))
    .map((line, index) => String(index + 1) + '. ' + line)
  const body = truncateMiddle(lines.join('\n'), maxPromptChars)
  return [
    'Compact the following earlier session items into a durable summary for a coding agent.',
    'This summary will replace the items above as the new leading context. Write it so the agent can continue the work without the original history.',
    'Cover: user goal, decisions and rationale, modified files (paths), commands and effects, key tool results and errors, current plan, and open risks.',
    'Do not invent facts. Use concise bullet lists.',
    '',
    body,
  ].join('\n')
}

function formatItemForSummary(item: AgentInputItem): string {
  const record = item as Record<string, unknown>
  if (isReasoningItem(item)) return ''

  if (record.type === 'message') {
    const text = extractMessageText(record.content)
    return text ? String(record.role ?? 'unknown') + ': ' + text : ''
  }
  if (record.type === 'function_call') {
    return 'tool_call ' + String(record.name ?? 'unknown') + ': ' + truncateMiddle(String(record.arguments ?? ''), 1200)
  }
  if (record.type === 'function_call_result') {
    return 'tool_result ' + String(record.callId ?? record.call_id ?? 'unknown') + ': ' + truncateMiddle(String(record.output ?? ''), 1200)
  }
  return truncateMiddle(JSON.stringify(item), 1200)
}

function isReasoningItem(item: AgentInputItem): boolean {
  const record = item as Record<string, unknown>
  return record.type === 'reasoning' || record.type === 'reasoning_item'
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return truncateMiddle(content, 1200)
  if (!Array.isArray(content)) return truncateMiddle(JSON.stringify(content), 1200)
  return truncateMiddle(content.map((part) => {
    if (!part || typeof part !== 'object') return String(part)
    const record = part as Record<string, unknown>
    if (record.type === 'reasoning' || record.type === 'reasoning_text') return ''
    return String(record.text ?? record.content ?? JSON.stringify(record))
  }).join('\n'), 1200)
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const half = Math.max(1, Math.floor((maxChars - 32) / 2))
  return value.slice(0, half) + '\n...[truncated]...\n' + value.slice(-half)
}

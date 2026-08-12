import type { ChatMessage } from './types.js'

export interface SummaryClient {
  summarize(input: { url: string; headers?: HeadersInit; model: string; messages: ChatMessage[]; maxPromptChars: number; maxOutputTokens: number }): Promise<string>
}

export class ChatCompletionsSummaryClient implements SummaryClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async summarize(input: { url: string; headers?: HeadersInit; model: string; messages: ChatMessage[]; maxPromptChars: number; maxOutputTokens: number }): Promise<string> {
    const response = await this.fetchImpl(input.url, {
      method: 'POST',
      headers: summaryHeaders(input.headers),
      body: JSON.stringify({
        model: input.model,
        stream: false,
        temperature: 0,
        max_tokens: input.maxOutputTokens,
        messages: [
          {
            role: 'system',
            content:
              'You compact coding-agent conversation history into a durable continuation summary. ' +
              'Preserve the user goal, constraints, decisions, changed files, commands, important tool results, errors, ' +
              'current progress, remaining work, and risks. Do not invent facts. Use concise factual bullet points.',
          },
          { role: 'user', content: buildSummaryInput(input.messages, input.maxPromptChars) },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Context summary failed (${response.status}): ${body.slice(0, 500)}`)
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const summary = payload.choices?.[0]?.message?.content
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      throw new Error('Context summary returned an empty result')
    }
    return summary.trim()
  }
}

function summaryHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  next.delete('content-length')
  next.delete('content-encoding')
  next.set('content-type', 'application/json')
  return next
}

function buildSummaryInput(messages: ChatMessage[], maxPromptChars: number): string {
  const rendered = messages.map((message, index) => `${index + 1}. ${renderMessage(message)}`).join('\n')
  return [
    'Summarize these earlier messages so a coding agent can continue without the original transcript.',
    'Keep concrete paths, commands, tool names, results, failures, decisions, and unfinished work.',
    '',
    truncateMiddle(rendered, maxPromptChars),
  ].join('\n')
}

function renderMessage(message: ChatMessage): string {
  const role = message.role ?? 'unknown'
  if (typeof message.content === 'string') return `${role}: ${message.content}`
  return `${role}: ${JSON.stringify(message)}`
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const half = Math.max(1, Math.floor((maxChars - 32) / 2))
  return `${value.slice(0, half)}\n...[truncated by context proxy]...\n${value.slice(-half)}`
}

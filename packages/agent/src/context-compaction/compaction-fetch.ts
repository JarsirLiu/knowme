import type { ContextCompactionOptions, ChatCompletionsRequest, ChatMessage } from './types.js'
import { compactChatMessages, selectChatMessageRange } from './message-selector.js'
import { estimateChatTokens } from './token-estimator.js'
import { ChatCompletionsSummaryClient, type SummaryClient } from './summary-client.js'

type CachedCompaction = {
  rawMessages: ChatMessage[]
  compactedMessages: ChatMessage[]
}

export class ChatCompletionsCompactionFetch {
  private cached?: CachedCompaction
  private readonly summaryClient: SummaryClient

  constructor(
    private readonly upstreamFetch: typeof fetch,
    private readonly options: ContextCompactionOptions,
    summaryClient?: SummaryClient,
  ) {
    this.summaryClient = summaryClient ?? new ChatCompletionsSummaryClient(upstreamFetch)
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (!this.options.enabled || !isChatCompletionsRequest(input, init)) {
      return this.upstreamFetch(input, init)
    }

    const body = parseRequestBody(init?.body)
    if (!body?.messages || !shouldCompact(body.messages, this.options)) {
      return this.upstreamFetch(input, init)
    }

    const compacted = await this.compactRequest(body, input, init?.headers)
    if (!compacted) return this.upstreamFetch(input, init)

    const nextInit = {
      ...init,
      headers: forwardedHeaders(init?.headers),
      body: JSON.stringify({ ...body, messages: compacted.messages }),
    }
    return this.upstreamFetch(input, nextInit)
  }

  private async compactRequest(
    request: ChatCompletionsRequest,
    input: RequestInfo | URL,
    headers?: HeadersInit,
  ) {
    const rawMessages = request.messages ?? []
    const messages = applyCachedCompaction(rawMessages, this.cached)
    if (!shouldCompact(messages, this.options)) {
      return { messages, compactedMessages: [], keptMessages: messages }
    }

    const sourceUrl = chatCompletionsUrl(input)
    const selection = selectChatMessageRange(messages, this.options.keepRecentTokens)
    if (!selection) return undefined
    const summary = await this.summaryClient.summarize({
      url: sourceUrl,
      headers,
      model: this.options.summaryModel || request.model || '',
      messages,
      maxPromptChars: this.options.maxPromptChars,
      maxOutputTokens: this.options.summaryMaxOutputTokens,
    })
    const summaryMessage = createSummaryMessage(summary)
    const result = compactChatMessages(messages, summaryMessage, this.options.keepRecentTokens)
    if (!result) return undefined

    this.cached = {
      rawMessages: [...rawMessages],
      compactedMessages: result.messages,
    }
    return result
  }
}

function shouldCompact(messages: ChatMessage[], options: ContextCompactionOptions): boolean {
  const inputBudget = Math.max(1, options.contextWindowTokens - options.outputReserveTokens - options.safetyMarginTokens)
  return estimateChatTokens(messages) >= Math.floor(inputBudget * options.triggerRatio)
}

function applyCachedCompaction(messages: ChatMessage[], cached?: CachedCompaction): ChatMessage[] {
  if (!cached || !startsWithMessages(messages, cached.rawMessages)) return messages
  return [...cached.compactedMessages, ...messages.slice(cached.rawMessages.length)]
}

function parseRequestBody(body: BodyInit | null | undefined): ChatCompletionsRequest | undefined {
  if (typeof body !== 'string') return undefined
  try {
    const parsed = JSON.parse(body) as ChatCompletionsRequest
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

function forwardedHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  next.delete('content-length')
  next.delete('content-encoding')
  return next
}

function isChatCompletionsRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'POST')).toUpperCase()
  if (method !== 'POST') return false
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return /\/chat\/completions(?:\?|$)/u.test(url)
}

function chatCompletionsUrl(input: RequestInfo | URL): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return url
}

function startsWithMessages(messages: ChatMessage[], prefix: ChatMessage[]): boolean {
  if (prefix.length > messages.length) return false
  return prefix.every((message, index) => JSON.stringify(message) === JSON.stringify(messages[index]))
}

function createSummaryMessage(summary: string): ChatMessage {
  return {
    role: 'system',
    content: 'Earlier context was compacted. Treat this summary as authoritative prior context:\n\n' + summary,
    providerData: { cloudagent: { kind: 'context_compaction' } },
  }
}

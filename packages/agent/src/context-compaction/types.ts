export type ChatMessage = {
  role?: string
  content?: unknown
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
  tool_call_id?: string
  name?: string
  [key: string]: unknown
}

export type ChatCompletionsRequest = {
  model?: string
  messages?: ChatMessage[]
  stream?: boolean
  [key: string]: unknown
}

export interface ContextCompactionOptions {
  enabled: boolean
  contextWindowTokens: number
  outputReserveTokens: number
  safetyMarginTokens: number
  triggerRatio: number
  keepRecentTokens: number
  maxPromptChars: number
  summaryModel: string
  summaryMaxOutputTokens: number
}

export interface CompactedChatInput {
  messages: ChatMessage[]
  compactedMessages: ChatMessage[]
  keptMessages: ChatMessage[]
}

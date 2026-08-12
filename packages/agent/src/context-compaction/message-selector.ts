import type { ChatMessage, CompactedChatInput } from './types.js'
import { estimateChatTokens } from './token-estimator.js'

export function compactChatMessages(
  messages: ChatMessage[],
  summary: ChatMessage,
  keepRecentTokens: number,
): CompactedChatInput | undefined {
  const selection = selectChatMessageRange(messages, keepRecentTokens)
  if (!selection) return undefined
  return {
    messages: [...selection.fixedMessages, summary, ...selection.keptMessages],
    compactedMessages: selection.compactedMessages,
    keptMessages: selection.keptMessages,
  }
}

export function selectChatMessageRange(messages: ChatMessage[], keepRecentTokens: number): {
  fixedMessages: ChatMessage[]
  compactedMessages: ChatMessage[]
  keptMessages: ChatMessage[]
} | undefined {
  const fixedCount = countFixedMessages(messages)
  const body = messages.slice(fixedCount)
  if (body.length < 2) return undefined

  const userStarts = body.flatMap((message, index) => message.role === 'user' ? [index] : [])
  const split = [...userStarts]
    .reverse()
    .find((index) => index > 0 && estimateChatTokens(body.slice(index)) <= keepRecentTokens)
  if (split === undefined) return undefined

  const compactedMessages = body.slice(0, split)
  const keptMessages = body.slice(split)
  if (compactedMessages.length === 0 || keptMessages.length === 0) return undefined
  if (!hasCompleteToolPairs(compactedMessages) || !hasCompleteToolPairs(keptMessages)) return undefined

  return {
    fixedMessages: messages.slice(0, fixedCount),
    compactedMessages,
    keptMessages,
  }
}

export function countFixedMessages(messages: ChatMessage[]): number {
  let index = 0
  while (index < messages.length && isFixedMessage(messages[index])) index += 1
  return index
}

function hasCompleteToolPairs(messages: ChatMessage[]): boolean {
  const callIds = new Set<string>()
  const resultIds = new Set<string>()
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (typeof call.id === 'string' && call.id.length > 0) callIds.add(call.id)
      }
    }
    if (message.role === 'tool' && typeof message.tool_call_id === 'string') {
      resultIds.add(message.tool_call_id)
    }
  }
  return [...callIds].every((id) => resultIds.has(id)) && [...resultIds].every((id) => callIds.has(id))
}

function isFixedMessage(message: ChatMessage): boolean {
  if (message.providerData && typeof message.providerData === 'object') {
    const cloudagent = (message.providerData as Record<string, unknown>).cloudagent
    if (cloudagent && typeof cloudagent === 'object' && (cloudagent as Record<string, unknown>).kind === 'context_compaction') {
      return false
    }
  }
  return message.role === 'system' || message.role === 'developer'
}

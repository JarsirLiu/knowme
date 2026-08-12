import assert from 'node:assert/strict'
import test from 'node:test'

import { compactChatMessages, selectChatMessageRange } from '../src/context-compaction/message-selector.js'
import { ChatCompletionsCompactionFetch } from '../src/context-compaction/compaction-fetch.js'
import type { ChatMessage, ContextCompactionOptions } from '../src/context-compaction/types.js'
import type { SummaryClient } from '../src/context-compaction/summary-client.js'

const options: ContextCompactionOptions = {
  enabled: true,
  contextWindowTokens: 100,
  outputReserveTokens: 10,
  safetyMarginTokens: 1,
  triggerRatio: 0.1,
  keepRecentTokens: 300,
  maxPromptChars: 10_000,
  summaryModel: 'summary-model',
  summaryMaxOutputTokens: 100,
}

test('message selector never splits an assistant tool call from its result', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'instructions' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: 'result' },
    { role: 'assistant', content: 'done' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'latest' },
  ]

  const selection = selectChatMessageRange(messages, 300)
  assert.ok(selection)
  assert.deepEqual(selection.compactedMessages.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant'])
  assert.deepEqual(selection.keptMessages.map((message) => message.role), ['user', 'assistant'])
  assert.equal(selection.compactedMessages[2].tool_call_id, 'call-1')
})

test('compaction fetch summarizes once and forwards the rewritten request', async () => {
  const requests: Array<{ url: string; body: any }> = []
  const upstream: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ id: 'response-1', choices: [{ message: { content: 'answer' } }] }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  const summaryClient: SummaryClient = {
    async summarize() { return 'durable summary' },
  }
  const proxy = new ChatCompletionsCompactionFetch(upstream, options, summaryClient)
  const body = {
    model: 'main-model',
    stream: false,
    messages: [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'new request' },
      { role: 'assistant', content: 'new answer' },
    ],
  }

  const response = await proxy.fetch('https://model.test/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-length': '1' },
    body: JSON.stringify(body),
  })

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].body.messages[1].content, 'Earlier context was compacted. Treat this summary as authoritative prior context:\n\ndurable summary')
  assert.equal(requests[0].body.messages[0].content, 'instructions')
  assert.equal(requests[0].body.messages.at(-1).content, 'new answer')
  assert.equal(requests[0].body.messages.some((message: ChatMessage) => message.content === 'old request'), false)
  assert.equal(requests[0].body.messages.some((message: ChatMessage) => message.content === 'old answer'), false)
})

test('selector skips compaction when no complete recent turn fits the budget', () => {
  const selection = selectChatMessageRange([
    { role: 'user', content: 'request' },
    { role: 'assistant', content: 'response' },
  ], 1)
  assert.equal(selection, undefined)
})

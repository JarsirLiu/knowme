import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatReducer } from '../../web/src/features/chat/state/reducer'
import type { ChatState, ChatEntry } from '../../web/src/features/chat/types'
import type { AnyTimelineEvent } from '@superagent/core'

function emptyState(): ChatState {
  return { entries: [], runtimeStatus: 'idle', requestPending: false, isLoading: false, isCompacting: false, error: null }
}

const compactionStarted = (id: string, trigger: 'auto' | 'manual'): AnyTimelineEvent => ({
  type: 'context_compaction.started', id, conversationId: 'c1', createdAt: new Date().toISOString(),
  data: { id, trigger },
} as AnyTimelineEvent)

const compactionCompleted = (id: string, trigger: 'auto' | 'manual'): AnyTimelineEvent => ({
  type: 'context_compaction.completed', id, conversationId: 'c1', createdAt: new Date().toISOString(),
  data: { id, trigger, compactedItems: 5, keptItems: 0, reason: 'ok' },
} as AnyTimelineEvent)

const compactionCount = (entries: ChatEntry[]) => entries.filter((e) => e.type === 'compaction').length

test('auto compaction: started + completed evolve ONE node (no duplicate)', () => {
  let state = emptyState()
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionStarted('cc1', 'auto') })
  assert.equal(compactionCount(state.entries), 1)
  assert.equal((state.entries[0] as Extract<ChatEntry, { type: 'compaction' }>).compaction.status, 'running')

  // replay started (out-of-order / duplicate) — must NOT create a second node
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionStarted('cc1', 'auto') })
  assert.equal(compactionCount(state.entries), 1)

  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionCompleted('cc1', 'auto') })
  assert.equal(compactionCount(state.entries), 1)
  assert.equal((state.entries[0] as Extract<ChatEntry, { type: 'compaction' }>).compaction.status, 'completed')
})

test('manual compaction: only completed event still yields exactly ONE node', () => {
  let state = emptyState()
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionCompleted('cc2', 'manual') })
  assert.equal(compactionCount(state.entries), 1)
  assert.equal((state.entries[0] as Extract<ChatEntry, { type: 'compaction' }>).compaction.trigger, 'manual')
  assert.equal((state.entries[0] as Extract<ChatEntry, { type: 'compaction' }>).compaction.status, 'completed')
})

test('UI order: compaction node sits between turns, AI message count == turn count', () => {
  let state = emptyState()
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: { type: 'turn.started', id: 't1', conversationId: 'c1', createdAt: new Date().toISOString(), runId: 'A', data: { userId: 'u1', userText: 'hi', userMessageId: 'um1', assistantMessageId: 'am1' } } as AnyTimelineEvent })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: { type: 'run.completed', id: 'rA', conversationId: 'c1', createdAt: new Date().toISOString(), runId: 'A', data: { error: undefined } } as AnyTimelineEvent })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionStarted('cc1', 'auto') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionCompleted('cc1', 'auto') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: { type: 'turn.started', id: 't2', conversationId: 'c1', createdAt: new Date().toISOString(), runId: 'B', data: { userId: 'u1', userText: 'again', userMessageId: 'um2', assistantMessageId: 'am2' } } as AnyTimelineEvent })

  assert.deepEqual(state.entries.map((e) => e.type), ['turn', 'compaction', 'turn'])
  const aiMessages = state.entries.filter((e) => e.type === 'turn')
  assert.equal(aiMessages.length, 2)
})

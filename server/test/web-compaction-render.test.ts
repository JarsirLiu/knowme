import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatReducer } from '../../web/src/features/chat/state/reducer'
import type { ChatState, ChatEntry } from '../../web/src/features/chat/types'
import type { AnyTimelineEvent } from '@superagent/core'

function emptyState(): ChatState {
  return { entries: [], runtimeStatus: 'idle', requestPending: false, isLoading: false, isCompacting: false, error: null }
}

const turnStarted = (runId: string, userText: string): AnyTimelineEvent => ({
  type: 'turn.started', id: runId, conversationId: 'c1', createdAt: new Date().toISOString(), runId,
  data: { userId: 'u1', userText, userMessageId: 'um-' + runId, assistantMessageId: 'am-' + runId },
} as AnyTimelineEvent)

const runCompleted = (runId: string): AnyTimelineEvent => ({
  type: 'run.completed', id: 'r-' + runId, conversationId: 'c1', createdAt: new Date().toISOString(), runId,
  data: { error: undefined },
} as AnyTimelineEvent)

const compactionStarted = (runId: string, id: string, trigger: 'auto' | 'manual'): AnyTimelineEvent => ({
  type: 'context_compaction.started', id, conversationId: 'c1', createdAt: new Date().toISOString(), runId,
  data: { id, trigger },
} as AnyTimelineEvent)

const compactionCompleted = (runId: string, id: string, trigger: 'auto' | 'manual'): AnyTimelineEvent => ({
  type: 'context_compaction.completed', id, conversationId: 'c1', createdAt: new Date().toISOString(), runId,
  data: { id, trigger, compactedItems: 5, keptItems: 0, reason: 'ok' },
} as AnyTimelineEvent)

test('auto compaction is a standalone node between turns, not inside an AI message', () => {
  let state = emptyState()
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: turnStarted('A', 'do task 1') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: runCompleted('A') })
  // auto compaction happens between turn A done and turn B start
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionStarted('A', 'cc1', 'auto') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionCompleted('A', 'cc1', 'auto') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: turnStarted('B', 'do task 2') })

  // Expect exactly 3 entries: turn A, compaction, turn B
  assert.equal(state.entries.length, 3)
  assert.equal(state.entries[0].type, 'turn')
  assert.equal(state.entries[1].type, 'compaction')
  assert.equal(state.entries[2].type, 'turn')

  // The compaction must NOT be embedded inside any turn's assistant message parts
  for (const entry of state.entries) {
    if (entry.type === 'turn') {
      const parts = entry.turn.assistantMessage.parts
      assert.ok(!parts.some((p: any) => p.type === 'compaction'), 'compaction must not live inside a turn')
    }
  }
  // And the AI messages count is exactly 2 (turn A + turn B), not 3
  const aiMessages = state.entries.filter((e) => e.type === 'turn')
  assert.equal(aiMessages.length, 2)
})

test('manual compaction is a standalone node', () => {
  let state = emptyState()
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: turnStarted('A', 'hi') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: runCompleted('A') })
  state = chatReducer(state, { type: 'TIMELINE_EVENT', event: compactionCompleted('A', 'cc2', 'manual') })

  assert.equal(state.entries.length, 2)
  assert.equal(state.entries[1].type, 'compaction')
  assert.equal((state.entries[1] as Extract<ChatEntry, { type: 'compaction' }>).compaction.trigger, 'manual')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_RUNTIME_STATUSES,
  ACTIVE_RUN_STATUSES,
  isActiveRun,
  isConversationAlive,
  isRuntimeStatusRunning,
  runtimeStatusForRuns,
} from '../src/modules/conversations/conversation-domain.js'

test('isActiveRun: matches the canonical active run set', () => {
  for (const status of ACTIVE_RUN_STATUSES) {
    assert.equal(isActiveRun(status), true, `expected ${status} to be an active run`)
  }
  for (const status of ['idle', 'failed', 'completed', 'interrupted', 'cancelled']) {
    assert.equal(isActiveRun(status), false, `expected ${status} not to be an active run`)
  }
})

test('isConversationAlive: only active is alive', () => {
  assert.equal(isConversationAlive('active'), true)
  assert.equal(isConversationAlive('archived'), false)
})

test('isRuntimeStatusRunning: matches the canonical active runtime set', () => {
  for (const status of ACTIVE_RUNTIME_STATUSES) {
    assert.equal(isRuntimeStatusRunning(status), true, `expected ${status} to be running`)
  }
  for (const status of ['idle', 'failed', 'interrupted', 'cancelled']) {
    assert.equal(isRuntimeStatusRunning(status), false, `expected ${status} not to be running`)
  }
})

test('ACTIVE_RUNTIME_STATUSES equals the documented active runtime set', () => {
  assert.deepEqual([...ACTIVE_RUNTIME_STATUSES].sort(), ['queued', 'running', 'waiting_approval'].sort())
})

test('runtimeStatusForRuns: empty runs is idle', () => {
  assert.equal(runtimeStatusForRuns([]), 'idle')
  assert.equal(runtimeStatusForRuns(undefined), 'idle')
})

test('runtimeStatusForRuns: priority running > waiting_approval > queued > terminal', () => {
  assert.equal(runtimeStatusForRuns([{ status: 'running' }, { status: 'idle' }]), 'running')
  assert.equal(runtimeStatusForRuns([{ status: 'waiting_approval' }, { status: 'idle' }]), 'waiting_approval')
  assert.equal(runtimeStatusForRuns([{ status: 'queued' }, { status: 'idle' }]), 'queued')
})

test('runtimeStatusForRuns: terminal-only falls through to the terminal status', () => {
  assert.equal(runtimeStatusForRuns([{ status: 'failed' }]), 'failed')
  assert.equal(runtimeStatusForRuns([{ status: 'interrupted' }]), 'interrupted')
  assert.equal(runtimeStatusForRuns([{ status: 'cancelled' }]), 'cancelled')
})

test('runtimeStatusForRuns: idle with a historical active run still reports active', () => {
  assert.equal(
    runtimeStatusForRuns([{ status: 'idle' }, { status: 'running' }]),
    'running',
  )
  assert.equal(
    runtimeStatusForRuns([{ status: 'idle' }, { status: 'waiting_approval' }]),
    'waiting_approval',
  )
})

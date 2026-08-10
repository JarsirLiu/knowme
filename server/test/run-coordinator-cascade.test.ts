import assert from 'node:assert/strict'
import test from 'node:test'
import { RunCoordinator } from '../src/modules/runs/run-coordinator.js'
import type { AgentRun } from '@prisma/client'

function makeRun(id: string, status: AgentRun['status'] = 'running'): AgentRun {
  return { id, status, conversationId: `conv-${id}` } as AgentRun
}

function makeCoordinator(runs: AgentRun[], children: Record<string, string[]>) {
  const requested: string[] = []
  const cancelled: string[] = []
  const runsById = new Map(runs.map((r) => [r.id, r]))
  const childrenByParent = new Map(Object.entries(children))

  const lifecycle = {
    get(id: string) {
      return Promise.resolve(runsById.get(id) ?? null)
    },
    requestCancel(id: string) {
      requested.push(id)
      return Promise.resolve()
    },
    cancel(run: AgentRun) {
      cancelled.push(run.id)
      return undefined
    },
    findChildRunIds(parentRunId: string) {
      return Promise.resolve(childrenByParent.get(parentRunId) ?? [])
    },
  }

  const coordinator = new RunCoordinator(
    {} as never,
    {} as never,
    { publish: () => undefined } as never,
    undefined,
    undefined,
    lifecycle as never,
  )

  return { coordinator, requested, cancelled }
}

function sameSet(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false
  const sorted = [...actual].sort()
  const exp = [...expected].sort()
  return sorted.every((v, i) => v === exp[i])
}

test('cancelWithChildren aborts the run and every spawned child run', async () => {
  const parent = makeRun('parent', 'running')
  const child = makeRun('child', 'running')
  const grandchild = makeRun('grandchild', 'running')
  const { coordinator, requested } = makeCoordinator(
    [parent, child, grandchild],
    { parent: ['child'], child: ['grandchild'] },
  )

  const result = await coordinator.cancelWithChildren('parent')

  assert.equal(result, true)
  assert.ok(sameSet(requested, ['parent', 'child', 'grandchild']), `requested=${JSON.stringify(requested)}`)
})

test('cancelWithChildren returns false and cancels nothing when the run is missing', async () => {
  const { coordinator, requested } = makeCoordinator([], {})

  const result = await coordinator.cancelWithChildren('missing')

  assert.equal(result, false)
  assert.equal(requested.length, 0)
})

test('cancelWithChildren stops at terminal child runs without descending further', async () => {
  const parent = makeRun('parent', 'running')
  const child = makeRun('child', 'completed')
  const { coordinator, requested } = makeCoordinator(
    [parent, child],
    { parent: ['child'] },
  )

  await coordinator.cancelWithChildren('parent')

  assert.ok(sameSet(requested, ['parent']), `requested=${JSON.stringify(requested)}`)
})

test('cancelWithChildren writes a cancelled event for queued child runs', async () => {
  const parent = makeRun('parent', 'queued')
  const child = makeRun('child', 'queued')
  const { coordinator, cancelled } = makeCoordinator(
    [parent, child],
    { parent: ['child'] },
  )

  await coordinator.cancelWithChildren('parent')

  assert.ok(sameSet(cancelled, ['parent', 'child']), `cancelled=${JSON.stringify(cancelled)}`)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { ConversationService } from '../src/modules/conversations/conversation.service.js'
import { ACTIVE_RUNTIME_STATUSES } from '../src/modules/conversations/conversation-domain.js'

function stubRepository() {
  const calls: Array<{ projectId: string; filter: unknown }> = []
  const repository = {
    list: async (filter: unknown) => {
      calls.push({ projectId: '', filter })
      return []
    },
    listChildrenOf: async () => [],
  }
  return { repository, calls }
}

test('listRunning passes the canonical active runtime set to the repository', async () => {
  const { repository, calls } = stubRepository()
  const service = new ConversationService(
    undefined as never,
    repository as never,
    undefined as never,
    undefined as never,
    undefined as never,
  )

  await service.listRunning('project-1')

  assert.equal(calls.length, 1)
  const filter = calls[0].filter as { runtimeStatuses?: string[] }
  assert.deepEqual(filter.runtimeStatuses, [...ACTIVE_RUNTIME_STATUSES])
})

test('list defaults to alive root conversations (no runtime filter)', async () => {
  const { repository, calls } = stubRepository()
  const service = new ConversationService(
    undefined as never,
    repository as never,
    undefined as never,
    undefined as never,
    undefined as never,
  )

  await service.list('project-1')

  assert.equal(calls.length, 1)
  const filter = calls[0].filter as { runtimeStatuses?: string[] }
  assert.equal(filter.runtimeStatuses, undefined)
})

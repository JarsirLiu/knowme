import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectService } from '../src/modules/projects/project.service.js'
import { SessionCompactionService } from '../src/modules/history/session-compaction.js'
import type { SessionCompactionRepository } from '../src/modules/history/session-compaction-repository.js'

test('project service delegates path validation and persistence independently', async () => {
  const calls: string[] = []
  const project = { id: 'project-1', name: 'Workspace', rootPath: 'C:\\workspace' } as any
  const service = new ProjectService(
    {
      async list() {
        calls.push('list')
        return [project]
      },
      async create(data) {
        calls.push(`create:${data.name}:${data.rootPath}`)
        return project
      },
      async get() {
        calls.push('get')
        return project
      },
    },
    {
      resolveDirectory(inputPath: string) {
        calls.push(`validate:${inputPath}`)
        return 'C:\\workspace'
      },
    },
  )

  await service.create({ name: ' Workspace ', rootPath: './workspace' })
  assert.deepEqual(calls, ['validate:./workspace', 'create:Workspace:C:\\workspace'])
})

test('session compaction can run with an injected persistence port', async () => {
  const items = ['one', 'two', 'three', 'four', 'five'].map((text) => ({
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text }],
  })) as any[]
  let replacement: any[] | undefined
  const repository: SessionCompactionRepository = {
    async readItems() {
      return items
    },
    async replaceItems(_sessionId, nextItems) {
      replacement = nextItems
    },
    async readUsageBaseline() {
      return undefined
    },
    async persistCompactionMessage() {
      return null
    },
  }
  const service = new SessionCompactionService(repository)

  const result = await service.compact('session-1', {
    enabled: true,
    contextWindowTokens: 100,
    outputReserveTokens: 10,
    safetyMarginTokens: 1,
    triggerRatio: 0.9,
    keepRecentTokens: 30,
    maxPromptChars: 4000,
    summarizer: {
      async summarize(input) {
        return `summary for ${input.items.length} items`
      },
    },
  }, 'manual')

  assert.equal(result.status, 'compacted')
  assert.equal(result.compactedItems, 4)
  assert.equal(replacement?.length, 2)
  assert.match(JSON.stringify(replacement?.[0]), /summary for 4 items/)
})

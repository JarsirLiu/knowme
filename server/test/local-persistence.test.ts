import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { prisma } from '../src/db/client.js'
import { ensureDatabase } from '../src/db/ensure-database.js'
import { ApprovalService } from '../src/modules/approvals/approval.service.js'
import { ConversationService } from '../src/modules/conversations/conversation.service.js'
import { RunEventStore } from '../src/modules/events/run-event-store.js'
import { PrismaAgentSession } from '../src/modules/history/agent-session-store.js'
import { ProjectService } from '../src/modules/projects/project.service.js'

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-test-'))
let projectId: string
let primaryConversationId: string

test.before(async () => {
  await ensureDatabase()
})

test.after(async () => {
  if (projectId) {
    await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined)
  }
  await prisma.$disconnect()
  fs.rmSync(workspace, { recursive: true, force: true })
})

test('project and conversation persistence is idempotent', async () => {
  const projects = new ProjectService()
  const project = await projects.create({ name: 'Test workspace', rootPath: workspace })
  projectId = project.id

  const conversations = new ConversationService()
  const first = await conversations.startTurn({
    projectId: project.id,
    message: 'first task',
    clientMessageId: 'test-client-message-1',
  })
  const duplicate = await conversations.startTurn({
    projectId: project.id,
    message: 'first task',
    clientMessageId: 'test-client-message-1',
  })

  assert.equal(first.created, true)
  assert.equal(duplicate.created, false)
  assert.equal(duplicate.conversation.id, first.conversation.id)
  assert.equal(duplicate.run.id, first.run.id)
  primaryConversationId = first.conversation.id

  const second = await conversations.continueTurn({
    conversationId: first.conversation.id,
    message: 'second task',
    clientMessageId: 'test-client-message-2',
  })
  assert.equal(second.created, true)

  const timeline = await conversations.getTimeline(first.conversation.id)
  assert.deepEqual(timeline.messages.map((message) => message.content), ['first task', 'second task'])
})

test('durable agent session preserves ordering and pop semantics', async () => {
  const sessionRecord = await prisma.agentSession.findUnique({
    where: { conversationId: primaryConversationId },
  })
  assert.ok(sessionRecord)

  const session = new PrismaAgentSession(sessionRecord.id)
  const first = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] } as any
  const second = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'world' }] } as any
  await session.addItems([first, second])

  assert.deepEqual(await session.getItems(), [first, second])
  assert.deepEqual(await session.getItems(1), [second])
  assert.deepEqual(await session.popItem(), second)
  assert.deepEqual(await session.getItems(), [first])
})

test('manual context compaction summarizes old session items and keeps recent items', async () => {
  const conversations = new ConversationService()
  const turn = await conversations.startTurn({
    projectId,
    message: 'compact this context',
    clientMessageId: 'test-compact-message-1',
  })
  const sessionRecord = await prisma.agentSession.findUnique({
    where: { conversationId: turn.conversation.id },
  })
  assert.ok(sessionRecord)

  const items = ['one', 'two', 'three', 'four', 'five'].map((text) => ({
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text }],
  })) as any[]
 const session = new PrismaAgentSession(sessionRecord.id, {
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
  })
  await session.addItems(items)
  await new RunEventStore().append(turn.run.id, 'run.usage', {
    inputTokens: 95,
    outputTokens: 10,
    totalTokens: 105,
    estimatedTokens: 10,
  })

  const result = await session.compact('manual')
 assert.equal(result.status, 'compacted')
 assert.equal(result.beforeItems, 5)
  assert.equal(result.afterItems, 2)
  assert.equal(result.compactedItems, 4)
  assert.ok(result.estimatedTokensBefore >= 90)
  assert.equal(result.confirmedInputTokens, 95)
  assert.equal(result.predictedInputTokens, 95 + result.estimatedTokensBefore - 10)

  const compacted = await session.getItems()
  assert.equal(compacted.length, 2)
 assert.equal((compacted[0] as any).role, 'system')
  assert.match(JSON.stringify(compacted[0]), /summary for 4 items/)
  assert.deepEqual(compacted.slice(1), items.slice(-1))
})

test('approval decisions are persisted and can be observed by a waiter', async () => {
  const run = await prisma.agentRun.findFirstOrThrow({ where: { conversationId: primaryConversationId } })
  const approvals = new ApprovalService()
  const toolCallId = `test-tool-${Date.now()}`
  await approvals.createApproval({
    runId: run.id,
    toolCallId,
    toolName: 'run_command',
    arguments: { command: 'echo test' },
  })

  const waiter = approvals.waitForApproval(toolCallId, run.id)
  assert.equal(await approvals.approve(run.conversationId, toolCallId), true)
  assert.equal(await waiter, true)
  assert.equal((await prisma.approval.findUnique({ where: { toolCallId } }))?.status, 'approved')
})

test('conversation delete archives it without losing persisted history', async () => {
  const conversations = new ConversationService()
  const turn = await conversations.startTurn({
    projectId,
    message: 'delete me later',
    clientMessageId: 'test-delete-message-1',
  })

  const beforeDelete = await conversations.list(projectId)
  assert.ok(beforeDelete.some((conversation) => conversation.id === turn.conversation.id))

  const deleted = await conversations.delete(turn.conversation.id)
  assert.equal(deleted.status, 'archived')

  const afterDelete = await conversations.list(projectId)
  assert.equal(afterDelete.some((conversation) => conversation.id === turn.conversation.id), false)

  const timeline = await conversations.getTimeline(turn.conversation.id)
  assert.deepEqual(timeline.messages.map((message) => message.content), ['delete me later'])

  await assert.rejects(
    conversations.continueTurn({
      conversationId: turn.conversation.id,
      message: 'should fail',
      clientMessageId: 'test-delete-message-2',
    }),
    /Conversation is not active/,
  )
})

test('HTTP routes validate project input and return the local project list', async () => {
  const app = createApp({ port: 0, workspace })
  await app.ready()

  const list = await app.inject({ method: 'GET', url: '/api/projects' })
  assert.equal(list.statusCode, 200)
  assert.ok(JSON.parse(list.body).projects.some((project: { id: string }) => project.id === projectId))

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: '', rootPath: '' },
  })
  assert.equal(invalid.statusCode, 400)

  await app.close()
})

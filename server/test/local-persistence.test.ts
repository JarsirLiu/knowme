import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { prisma } from '../src/db/client.js'
import { ensureDatabase } from '../src/db/ensure-database.js'
import { ConversationService } from '../src/services/conversation-service.js'
import { PrismaAgentSession } from '../src/services/durable-session.js'
import { ProjectService } from '../src/services/project-service.js'
import { ToolApprovalService } from '../src/services/tool-approval.js'

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-test-'))
let projectId: string

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
    where: { conversationId: (await prisma.conversation.findFirstOrThrow({ where: { id: { not: '' } } })).id },
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

test('approval decisions are persisted and can be observed by a waiter', async () => {
  const run = await prisma.agentRun.findFirstOrThrow({ where: { conversationId: { not: '' } } })
  const approvals = new ToolApprovalService()
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

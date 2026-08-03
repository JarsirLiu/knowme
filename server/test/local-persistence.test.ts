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
import { TimelineEventStore } from '../src/modules/events/timeline-event-store.js'
import { PrismaAgentSession } from '../src/modules/history/agent-session-store.js'
import { persistCompactionMessage } from '../src/modules/history/session-compaction.js'
import { ProjectService } from '../src/modules/projects/project.service.js'
import { extractRawStreamDelta } from '../src/modules/chat/turn.service.js'

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-test-'))
let projectId: string
let primaryConversationId: string
const timelineStore = new TimelineEventStore()

test.before(async () => {
  await ensureDatabase()
})

test('normalizes reasoning and message streaming events from Agents SDK providers', () => {
  assert.deepEqual(
    extractRawStreamDelta({
      type: 'raw_model_stream_event',
      data: {
        type: 'model',
        event: { type: 'reasoning-delta', id: 'reasoning-1', delta: '先分析' },
      },
    } as any, 'run-1'),
    {
      type: 'reasoning.delta',
      data: { messageId: 'reasoning-1', text: '先分析' },
    },
  )

  assert.deepEqual(
    extractRawStreamDelta({
      type: 'raw_model_stream_event',
      data: {
        type: 'model',
        event: {
          type: 'response.reasoning_summary_text.delta',
          item_id: 'rs_1',
          delta: '检查实现',
        },
      },
    } as any, 'run-2'),
    {
      type: 'reasoning.delta',
      data: { messageId: 'rs_1', text: '检查实现' },
    },
  )

  assert.deepEqual(
    extractRawStreamDelta({
      type: 'raw_model_stream_event',
      data: { type: 'output_text_delta', itemId: 'message-1', delta: '完成' },
    } as any, 'run-3'),
    {
      type: 'message.delta',
      data: { messageId: 'message-1', text: '完成' },
    },
  )

  assert.equal(
    extractRawStreamDelta({
      type: 'raw_model_stream_event',
      data: {
        type: 'model',
        event: { type: 'output_text_delta', itemId: 'message-1', delta: '完成' },
      },
    } as any, 'run-4'),
    null,
  )
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

  const conversations = new ConversationService(timelineStore)
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
  assert.deepEqual(
    timeline.events
      .filter((event) => event.type === 'turn.started')
      .map((event) => event.data.userText),
    ['first task', 'second task'],
  )
  assert.deepEqual(timeline.events.map((event) => event.sequence), [1, 2])
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
  const conversations = new ConversationService(timelineStore)
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
  await timelineStore.append(turn.conversation.id, turn.run.id, 'run.usage', {
    inputTokens: 95,
    outputTokens: 10,
    totalTokens: 105,
    estimatedTokens: 10,
    source: 'test',
  })

  const result = await session.compact('manual')
 assert.equal(result.status, 'compacted')
 assert.equal(result.beforeItems, 5)
  assert.equal(result.afterItems, 2)
  assert.equal(result.compactedItems, 4)
  assert.ok(result.estimatedTokensBefore >= 90)
  assert.equal(result.confirmedInputTokens, 95)
 assert.equal(result.predictedInputTokens, 95 + result.estimatedTokensBefore - 10)

  await persistCompactionMessage(sessionRecord.id, result)
  await timelineStore.append(turn.conversation.id, null, 'context_compaction.completed', {
    id: 'test-manual-compaction',
    trigger: 'manual',
    compactedItems: result.compactedItems,
    keptItems: result.keptItems,
    reason: result.reason,
  })
  const timeline = await conversations.getTimeline(turn.conversation.id)
  const compactionEvent = timeline.events.find((event) => event.type === 'context_compaction.completed')
  assert.equal(compactionEvent?.type, 'context_compaction.completed')
  assert.equal(compactionEvent?.data.trigger, 'manual')
  assert.equal(compactionEvent?.data.compactedItems, 4)

  const compacted = await session.getItems()
  assert.equal(compacted.length, 2)
 assert.equal((compacted[0] as any).role, 'system')
  assert.match(JSON.stringify(compacted[0]), /summary for 4 items/)
  assert.deepEqual(compacted.slice(1), items.slice(-1))
})

test('approval decisions are persisted durably for coordinator recovery', async () => {
  const run = await prisma.agentRun.findFirstOrThrow({ where: { conversationId: primaryConversationId } })
  const approvals = new ApprovalService()
  const toolCallId = `test-tool-${Date.now()}`
  await approvals.createApproval({
    runId: run.id,
    toolCallId,
    toolName: 'run_command',
    arguments: { command: 'echo test' },
  })

  assert.equal(await approvals.approve(run.conversationId, toolCallId), true)
  assert.equal((await prisma.approval.findUnique({ where: { toolCallId } }))?.status, 'approved')
  assert.equal((await approvals.getPendingForRun(run.id)).length, 0)
})

test('conversation delete archives it without losing persisted history', async () => {
  const conversations = new ConversationService(timelineStore)
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
  assert.deepEqual(
    timeline.events
      .filter((event) => event.type === 'turn.started')
      .map((event) => event.data.userText),
    ['delete me later'],
  )

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
  const nestedDirectory = path.join(workspace, 'nested-directory')
  fs.mkdirSync(nestedDirectory)
  const app = createApp({ port: 0, workspace })
  await app.ready()

  const list = await app.inject({ method: 'GET', url: '/api/projects' })
  assert.equal(list.statusCode, 200)
  assert.ok(JSON.parse(list.body).projects.some((project: { id: string }) => project.id === projectId))

  const directories = await app.inject({
    method: 'GET',
    url: `/api/directories?path=${encodeURIComponent(workspace)}`,
  })
  assert.equal(directories.statusCode, 200)
  const directoryListing = JSON.parse(directories.body)
  assert.equal(directoryListing.currentPath, path.resolve(workspace))
  assert.equal(directoryListing.parentPath, path.dirname(path.resolve(workspace)))
  assert.ok(directoryListing.rootPaths.includes(path.parse(path.resolve(workspace)).root))
  assert.deepEqual(directoryListing.entries, [{ name: 'nested-directory', path: nestedDirectory }])

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: '', rootPath: '' },
  })
  assert.equal(invalid.statusCode, 400)

  await app.close()
})

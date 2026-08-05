import assert from 'node:assert/strict'
import fs from 'node:fs'
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
import { RunCoordinator } from '../src/modules/runs/run-coordinator.js'
import { PrismaRunLifecycleRepository } from '../src/modules/runs/run-lifecycle-repository.js'
import { RunScheduler } from '../src/modules/runs/run-scheduler.js'
import { TimelineEventHub } from '../src/modules/events/timeline-event-hub.js'

const tempRoot = path.resolve(process.cwd(), '..', '.data', 'temp')
fs.mkdirSync(tempRoot, { recursive: true })
const workspace = fs.mkdtempSync(path.join(tempRoot, 'server-workspace-'))
let projectId: string
let primaryConversationId: string
const timelineStore = new TimelineEventStore()

test.before(async () => {
  await ensureDatabase()
})

test('configures SQLite for concurrent local access', async () => {
  const journalMode = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode')
  const busyTimeout = await prisma.$queryRawUnsafe<Array<{ timeout: number }>>('PRAGMA busy_timeout')

  assert.equal(journalMode[0]?.journal_mode.toLowerCase(), 'wal')
  assert.equal(Number(busyTimeout[0]?.timeout), 5000)
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

test('transaction-created timeline events use the configured publisher', async () => {
  const hub = new TimelineEventHub()
  const store = new TimelineEventStore(hub)
  const conversations = new ConversationService(store)
  const received: string[] = []
  const unsubscribe = hub.subscribe(primaryConversationId, (event) => received.push(event.type))

  await conversations.continueTurn({
    conversationId: primaryConversationId,
    message: 'published turn',
    clientMessageId: 'test-published-message-1',
  })

  unsubscribe()
  assert.deepEqual(received, ['turn.started'])
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
  assert.equal(await approvals.approve(run.conversationId, toolCallId), true)
  assert.equal((await prisma.approval.findUnique({ where: { toolCallId } }))?.status, 'approved')
  assert.equal((await approvals.getPendingForRun(run.id)).length, 0)
})

test('conversation active-run reservation allows only one concurrent claim', async () => {
  await prisma.agentRun.updateMany({
    where: { status: 'queued' },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  const conversations = new ConversationService(timelineStore)
  const first = await conversations.startTurn({
    projectId,
    message: 'claim first',
    clientMessageId: 'test-claim-message-1',
  })
  const second = await conversations.continueTurn({
    conversationId: first.conversation.id,
    message: 'claim second',
    clientMessageId: 'test-claim-message-2',
  })
  const coordinatorA = new RunCoordinator(conversations, new ApprovalService(), timelineStore)
  const coordinatorB = new RunCoordinator(conversations, new ApprovalService(), timelineStore)
  const claimNext = (coordinator: RunCoordinator) => (coordinator as unknown as {
    claimNext: () => Promise<{ id: string } | null>
  }).claimNext()

  const claims = await Promise.all([claimNext(coordinatorA), claimNext(coordinatorB)])
  assert.equal(claims.filter(Boolean).length, 1)
  const claimed = claims.find((claim): claim is { id: string } => Boolean(claim))
  assert.ok(claimed)
  assert.equal((await prisma.conversation.findUnique({ where: { id: first.conversation.id } }))?.activeRunId, claimed.id)
  assert.equal((await prisma.agentRun.count({ where: { conversationId: first.conversation.id, status: 'running' } })), 1)
  assert.equal((await prisma.agentRun.findUnique({ where: { id: second.run.id } }))?.status, 'queued')
  await assert.rejects(
    timelineStore.appendOwned(first.conversation.id, claimed.id, 'stale-coordinator', 'run.started', {}),
    /Run lease lost/,
  )
})

test('restart marks waiting approval without state as interrupted', async () => {
  const conversations = new ConversationService(timelineStore)
  const turn = await conversations.startTurn({
    projectId,
    message: 'recover approval state',
    clientMessageId: 'test-recovery-message-1',
  })
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: { status: 'waiting_approval', state: null },
  })
  await prisma.conversation.update({ where: { id: turn.conversation.id }, data: { activeRunId: turn.run.id } })

  const coordinator = new RunCoordinator(conversations, new ApprovalService(), timelineStore)
  await (coordinator as unknown as { recoverAfterRestart: () => Promise<void> }).recoverAfterRestart()

  const recovered = await prisma.agentRun.findUnique({ where: { id: turn.run.id } })
  assert.equal(recovered?.status, 'interrupted')
  assert.equal((await prisma.conversation.findUnique({ where: { id: turn.conversation.id } }))?.activeRunId, null)
  assert.equal((await timelineStore.list(turn.conversation.id)).at(-1)?.type, 'run.interrupted')
})

test('requeues a failed owned run from its SDK checkpoint', async () => {
  const conversations = new ConversationService(timelineStore)
  const turn = await conversations.startTurn({
    projectId,
    message: 'recover from checkpoint',
    clientMessageId: 'test-checkpoint-recovery-message-1',
  })
  const owner = 'checkpoint-test-owner'
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: {
      status: 'running',
      state: '{"checkpoint":true}',
      leaseOwner: owner,
      leaseExpiresAt: new Date(Date.now() + 30_000),
    },
  })
  await prisma.conversation.update({
    where: { id: turn.conversation.id },
    data: { activeRunId: turn.run.id },
  })

  const requeued = await new PrismaRunLifecycleRepository().requeueFromCheckpoint(
    turn.run.id,
    turn.conversation.id,
    '{"checkpoint":true}',
    owner,
  )
  assert.equal(requeued, true)
  const recovered = await prisma.agentRun.findUnique({ where: { id: turn.run.id } })
  assert.equal(recovered?.status, 'queued')
  assert.equal(recovered?.state, '{"checkpoint":true}')
  assert.equal(recovered?.leaseOwner, null)
  assert.equal((await prisma.conversation.findUnique({ where: { id: turn.conversation.id } }))?.activeRunId, null)
})

test('interrupts checkpointed runs that reached the recovery limit', async () => {
  const conversations = new ConversationService(timelineStore)
  const restartTurn = await conversations.startTurn({
    projectId,
    message: 'stop repeated restart recovery',
    clientMessageId: 'test-recovery-limit-restart-1',
  })
  await prisma.agentRun.update({
    where: { id: restartTurn.run.id },
    data: {
      status: 'running',
      attempt: 3,
      state: '{"checkpoint":true}',
      leaseOwner: 'old-server',
      leaseExpiresAt: new Date(Date.now() - 1_000),
    },
  })
  await prisma.conversation.update({ where: { id: restartTurn.conversation.id }, data: { activeRunId: restartTurn.run.id } })

  const coordinator = new RunCoordinator(conversations, new ApprovalService(), timelineStore)
  await (coordinator as unknown as { recoverAfterRestart: () => Promise<void> }).recoverAfterRestart()

  const restartRecovered = await prisma.agentRun.findUnique({ where: { id: restartTurn.run.id } })
  assert.equal(restartRecovered?.status, 'interrupted')
  assert.match(restartRecovered?.error ?? '', /recovery attempt limit/i)
  assert.equal((await timelineStore.list(restartTurn.conversation.id)).at(-1)?.type, 'run.interrupted')

  const expiredTurn = await conversations.startTurn({
    projectId,
    message: 'stop repeated lease recovery',
    clientMessageId: 'test-recovery-limit-expired-1',
  })
  await prisma.agentRun.update({
    where: { id: expiredTurn.run.id },
    data: {
      status: 'running',
      attempt: 3,
      state: '{"checkpoint":true}',
      leaseOwner: 'expired-server',
      leaseExpiresAt: new Date(Date.now() - 1_000),
    },
  })
  await prisma.conversation.update({ where: { id: expiredTurn.conversation.id }, data: { activeRunId: expiredTurn.run.id } })

  const event = await new PrismaRunLifecycleRepository().recoverExpired(
    (await prisma.agentRun.findUniqueOrThrow({ where: { id: expiredTurn.run.id } })),
    3,
  )
  if (event) timelineStore.publish(event)
  const expiredRecovered = await prisma.agentRun.findUnique({ where: { id: expiredTurn.run.id } })
  assert.equal(expiredRecovered?.status, 'interrupted')
  assert.match(expiredRecovered?.error ?? '', /recovery attempt limit/i)
  assert.equal((await timelineStore.list(expiredTurn.conversation.id)).at(-1)?.type, 'run.interrupted')
})

test('stale recovery snapshots cannot overwrite a newer lease', async () => {
  const conversations = new ConversationService(timelineStore)
  const turn = await conversations.startTurn({
    projectId,
    message: 'protect newer lease',
    clientMessageId: 'test-stale-recovery-snapshot-1',
  })
  const lifecycle = new PrismaRunLifecycleRepository()
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: {
      status: 'running',
      state: '{"checkpoint":true}',
      leaseOwner: 'old-owner',
      leaseExpiresAt: new Date(Date.now() - 1_000),
    },
  })
  const staleSnapshot = await prisma.agentRun.findUniqueOrThrow({ where: { id: turn.run.id } })
  await prisma.conversation.update({ where: { id: turn.conversation.id }, data: { activeRunId: turn.run.id } })
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: {
      leaseOwner: 'new-owner',
      leaseExpiresAt: new Date(Date.now() + 30_000),
    },
  })

  const event = await lifecycle.recoverExpired(staleSnapshot, 3)
  assert.equal(event, undefined)
  const current = await prisma.agentRun.findUniqueOrThrow({ where: { id: turn.run.id } })
  assert.equal(current.status, 'running')
  assert.equal(current.leaseOwner, 'new-owner')
  assert.equal((await prisma.conversation.findUnique({ where: { id: turn.conversation.id } }))?.activeRunId, turn.run.id)
})

test('timeline hub isolates disconnected listeners and cleans subscriptions', () => {
  const hub = new TimelineEventHub()
  let calls = 0
  const unsubscribe = hub.subscribe('conversation-1', () => { throw new Error('socket closed') })
  hub.subscribe('conversation-1', () => { calls += 1 })
  hub.publish({
    id: 'event-1',
    conversationId: 'conversation-1',
    runId: null,
    sequence: 1,
    type: 'run.started',
    data: {},
    createdAt: new Date().toISOString(),
  })
  assert.equal(calls, 1)
  unsubscribe()
  unsubscribe()
  assert.equal((hub as unknown as { listeners: Map<string, Set<unknown>> }).listeners.get('conversation-1')?.size, 1)
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

  await assert.rejects(
    conversations.delete(turn.conversation.id),
    /Conversation has an active run/,
  )
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: { status: 'cancelled', finishedAt: new Date() },
  })

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

test('scheduler does not claim queued work from an archived conversation', async () => {
  await prisma.agentRun.updateMany({
    where: { status: 'queued' },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  const conversations = new ConversationService(timelineStore)
  const turn = await conversations.startTurn({
    projectId,
    message: 'do not run archived work',
    clientMessageId: 'test-archived-queued-run-1',
  })
  await prisma.conversation.update({ where: { id: turn.conversation.id }, data: { status: 'archived' } })

  const claimed = await new RunScheduler().claimNext('archived-test-owner')
  assert.notEqual(claimed?.id, turn.run.id)
  assert.equal((await prisma.agentRun.findUnique({ where: { id: turn.run.id } }))?.status, 'queued')
})

test('scheduler repairs a stale candidate active-run pointer before claiming', async () => {
  await prisma.agentRun.updateMany({
    where: { status: 'queued' },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  const conversations = new ConversationService(timelineStore)
  const turn = await conversations.startTurn({
    projectId,
    message: 'repair stale active run pointer',
    clientMessageId: 'test-stale-active-run-pointer-1',
  })
  await prisma.conversation.update({
    where: { id: turn.conversation.id },
    data: { activeRunId: turn.run.id },
  })
  await prisma.agentRun.update({
    where: { id: turn.run.id },
    data: { status: 'queued', finishedAt: null },
  })

  const claimed = await new RunScheduler().claimNext('stale-pointer-test-owner')
  assert.equal(claimed?.id, turn.run.id)
  assert.equal((await prisma.agentRun.findUnique({ where: { id: turn.run.id } }))?.status, 'running')
  assert.equal((await prisma.conversation.findUnique({ where: { id: turn.conversation.id } }))?.activeRunId, turn.run.id)
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

import { run, RunState, type Agent, type RunStreamEvent } from '@openai/agents'
import { createCodingAgent, type CodingAgent } from '@superagent/agent'
import { prisma } from '../../db/client.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { appendTimelineEvent, TimelineEventStore } from '../events/timeline-event-store.js'
import { PrismaAgentSession } from '../history/agent-session-store.js'
import { estimateTokens, loadSessionCompactionOptions } from '../history/session-compaction.js'
import { persistRunStreamEvent, type StreamEventState } from './stream-event-mapper.js'

type CodingAgentInstance = CodingAgent['agent']
type PersistedRunState = RunState<unknown, CodingAgentInstance>
type RunInput = string | PersistedRunState
type ApprovalInterruption = { rawItem?: unknown }
type AgentStream = AsyncIterable<RunStreamEvent> & {
  state: PersistedRunState
  interruptions: ApprovalInterruption[]
  finalOutput?: unknown
  completed: Promise<void>
}

export class AgentRunExecutor {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly approvalService: ApprovalService,
    private readonly timelineStore: TimelineEventStore,
  ) {}

  async execute(runId: string, signal: AbortSignal, resumed: boolean, leaseOwner: string): Promise<'completed' | 'waiting_approval'> {
    const agentRun = await prisma.agentRun.findUnique({ where: { id: runId } })
    if (!agentRun) throw new Error(`Run not found: ${runId}`)
    if (agentRun.status !== 'running' || agentRun.leaseOwner !== leaseOwner) throw new Error(`Run lease lost: ${runId}`)

    const conversation = await this.conversationService.get(agentRun.conversationId)
    const project = await prisma.project.findUnique({ where: { id: conversation.projectId } })
    if (!project) throw new Error(`Project not found: ${conversation.projectId}`)

    const { agent } = createCodingAgent({ workspace: project.rootPath })
    const sessionId = await this.conversationService.getSessionId(conversation.id)
    const session = new PrismaAgentSession(sessionId, loadSessionCompactionOptions(), {
      started: async ({ id, trigger }) => {
        await this.emit(conversation.id, runId, 'context_compaction.started', { id, trigger }, leaseOwner)
      },
      completed: async ({ id, trigger, result }) => {
        await this.emit(conversation.id, runId, 'context_compaction.completed', {
          id,
          trigger,
          compactedItems: result.compactedItems,
          keptItems: result.keptItems,
          reason: result.reason,
        }, leaseOwner)
      },
      failed: async ({ id, trigger, error }) => {
        await this.emit(conversation.id, runId, 'context_compaction.failed', { id, trigger, error }, leaseOwner)
      },
    })

    const input = await this.loadInput(agent, agentRun.input, agentRun.state)
    const state = input instanceof RunState ? await this.applyApprovals(agentRun.id, conversation.id, input, leaseOwner) : undefined
    await this.emit(conversation.id, runId, resumed ? 'run.resumed' : 'run.started', {}, leaseOwner)
    const stream = await run(agent, state ?? input, {
      maxTurns: null,
      stream: true,
      session,
      signal,
    })

    const streamState: StreamEventState = { sawReasoningDelta: false }
    await this.consumeStream(stream, conversation.id, runId, streamState, leaseOwner)

    const interruptions = stream.interruptions
    if (interruptions.length > 0) {
      const waitingEvents: import('@superagent/core').AnyTimelineEvent[] = []
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.agentRun.updateMany({
          where: { id: runId, status: 'running', leaseOwner },
          data: {
            status: 'waiting_approval',
            state: stream.state.toString(),
            lastHeartbeatAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        })
        if (claimed.count !== 1) throw new Error(`Run lease lost: ${runId}`)
        await tx.conversation.update({ where: { id: conversation.id }, data: { activeRunId: null } })
        waitingEvents.push(await appendTimelineEvent(tx, conversation.id, runId, 'run.waiting_approval', {}))
        for (const interruption of interruptions) {
          const details = approvalDetails(interruption)
          await tx.approval.upsert({
            where: { toolCallId: details.toolCallId },
            create: {
              runId,
              toolCallId: details.toolCallId,
              toolName: details.toolName,
              arguments: JSON.stringify(details.arguments),
              status: 'pending',
            },
            update: {
              runId,
              toolName: details.toolName,
              arguments: JSON.stringify(details.arguments),
              status: 'pending',
              decision: null,
              resolvedAt: null,
            },
          })
          waitingEvents.push(await appendTimelineEvent(tx, conversation.id, runId, 'tool.awaiting_approval', {
              toolCallId: details.toolCallId,
              name: details.toolName,
              args: details.arguments,
            }))
        }
      })
      for (const event of waitingEvents) this.timelineStore.publish(event)
      return 'waiting_approval'
    }

    await this.completeRun(agentRun.id, conversation.id, runId, stream, session, leaseOwner)
    return 'completed'
  }

  private async applyApprovals(
    runId: string,
    conversationId: string,
    state: PersistedRunState,
    leaseOwner: string,
  ) {
    const interruptions = state.getInterruptions()
    const approvals = await this.approvalService.getForRun(runId)
    for (const interruption of interruptions) {
      const callId = approvalDetails(interruption).toolCallId
      const approval = approvals.find((item) => item.toolCallId === callId)
      if (!approval || approval.status === 'pending') throw new Error(`Approval is still pending: ${callId}`)
      if (approval.status === 'approved') {
        state.approve(interruption)
        await this.emit(conversationId, runId, 'tool.approved', { toolCallId: callId }, leaseOwner)
      } else {
        state.reject(interruption)
        await this.emit(conversationId, runId, 'tool.denied', { toolCallId: callId }, leaseOwner)
      }
    }
    const updated = await prisma.agentRun.updateMany({
      where: { id: runId, status: 'running', leaseOwner },
      data: { state: state.toString() },
    })
    if (updated.count !== 1) throw new Error(`Run lease lost: ${runId}`)
    return state
  }

  private async loadInput(agent: Agent, input: string, serializedState: string | null): Promise<RunInput> {
    if (!serializedState) return input
    return RunState.fromString(agent, serializedState)
  }

  private async consumeStream(
    stream: AgentStream,
    conversationId: string,
    runId: string,
    streamState: StreamEventState,
    leaseOwner: string,
  ) {
    for await (const event of stream as AsyncIterable<RunStreamEvent>) {
      await persistRunStreamEvent(this.timelineStore, conversationId, runId, event, streamState, leaseOwner)
      const heartbeat = await prisma.agentRun.updateMany({
        where: { id: runId, status: 'running', leaseOwner },
        data: { lastHeartbeatAt: new Date() },
      })
      if (heartbeat.count !== 1) throw new Error(`Run lease lost: ${runId}`)
    }
    await stream.completed
  }

  private async completeRun(
    runId: string,
    conversationId: string,
    timelineRunId: string,
    stream: AgentStream,
    session: PrismaAgentSession,
    leaseOwner: string,
  ) {
    const usage = getLatestModelUsage(stream.state)
    if (usage) {
      await this.emit(conversationId, timelineRunId, 'run.usage', {
        ...usage,
        estimatedTokens: estimateTokens(await session.getItems()),
        source: 'provider',
      }, leaseOwner)
    }
    const finalOutput = stringifyOutput(stream.finalOutput)
    let completedEvent: import('@superagent/core').AnyTimelineEvent
    await prisma.$transaction(async (tx) => {
      const ownedRun = await tx.agentRun.updateMany({
        where: { id: runId, status: 'running', leaseOwner },
        data: {
          status: 'completed',
          output: finalOutput || null,
          state: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      })
      if (ownedRun.count !== 1) throw new Error(`Run lease lost: ${runId}`)
      if (finalOutput) {
        await tx.message.upsert({
          where: { id: runId },
          create: { id: runId, conversationId, runId, role: 'assistant', content: finalOutput },
          update: { content: finalOutput },
        })
      }
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      await tx.conversation.update({ where: { id: conversationId }, data: { activeRunId: null } })
      completedEvent = await appendTimelineEvent(tx, conversationId, timelineRunId, 'run.completed', { output: finalOutput })
    })
    this.timelineStore.publish(completedEvent!)
  }

  private async emit<T extends import('@superagent/core').TimelineEventType>(
    conversationId: string,
    runId: string,
    type: T,
    data: import('@superagent/core').TimelineEventPayloadMap[T],
    leaseOwner?: string,
  ) {
    if (leaseOwner) {
      await this.timelineStore.appendOwned(conversationId, runId, leaseOwner, type, data)
      return
    }
    await this.timelineStore.append(conversationId, runId, type, data)
  }
}

function approvalDetails(interruption: { rawItem?: unknown }) {
  const raw = interruption.rawItem && typeof interruption.rawItem === 'object'
    ? interruption.rawItem as Record<string, unknown>
    : {}
  const rawArguments = raw.arguments ?? '{}'
  let args: unknown = rawArguments
  if (typeof rawArguments === 'string') {
    try { args = JSON.parse(rawArguments) } catch { args = rawArguments }
  }
  return {
    toolCallId: String(raw.callId ?? raw.id ?? 'unknown'),
    toolName: String(raw.name ?? 'unknown'),
    arguments: args,
  }
}

function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value)
}

function getLatestModelUsage(state: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
  if (!state || typeof state !== 'object') return undefined
  const record = state as Record<string, unknown>
  const responses = Array.isArray(record._modelResponses) ? record._modelResponses : []
  const response = responses.at(-1)
  const usage = response && typeof response === 'object'
    ? (response as Record<string, unknown>).usage
    : record.usage
  if (!usage || typeof usage !== 'object') return undefined
  const value = usage as Record<string, unknown>
  const inputTokens = Number(value.inputTokens)
  const outputTokens = Number(value.outputTokens)
  const totalTokens = Number(value.totalTokens)
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return undefined
  return { inputTokens, outputTokens, totalTokens: Number.isFinite(totalTokens) ? totalTokens : inputTokens + outputTokens }
}

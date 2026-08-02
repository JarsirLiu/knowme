import type { FastifyReply } from 'fastify'
import { run, RunState, type Agent, type RunStreamEvent } from '@openai/agents'
import { createCodingAgent } from '@superagent/agent'
import { prisma } from '../../db/client.js'
import { setupSSEHeaders, sendSSE } from '../../utils/sse.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { RunEventStore } from '../events/run-event-store.js'
import { PrismaAgentSession } from '../history/agent-session-store.js'

type TurnTarget =
  | { projectId: string; conversationId?: undefined }
  | { conversationId: string; projectId?: undefined }

export class TurnService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly approvalService: ApprovalService,
    private readonly eventStore: RunEventStore,
  ) {}

  async handleTurn(
    target: TurnTarget,
    message: string,
    clientMessageId: string,
    reply: FastifyReply,
  ) {
    setupSSEHeaders(reply)
    const abortController = new AbortController()
    const handleClose = () => {
      if (!reply.raw.writableEnded) abortController.abort()
    }
    reply.raw.once('close', handleClose)

    try {
      if (!message.trim()) throw new Error('Message cannot be empty')
      const turn = target.projectId
        ? await this.conversationService.startTurn({
            projectId: target.projectId,
            message,
            clientMessageId,
          })
        : await this.conversationService.continueTurn({
            conversationId: target.conversationId!,
            message,
            clientMessageId,
          })

      const { conversation, run: agentRun, created: isNew } = turn
      if (target.projectId) {
        sendSSE(reply, {
          type: 'conversation_created',
          data: {
            conversationId: conversation.id,
            runId: agentRun.id,
            title: conversation.title,
          },
        })
      }

      if (!isNew) {
        await this.replayExistingRun(agentRun, reply)
        return
      }

      await this.executeRun(conversation.id, agentRun.id, reply, abortController.signal)
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      if (!abortController.signal.aborted) {
        sendSSE(reply, { type: 'error', data: { message: messageText } })
      }
    } finally {
      reply.raw.off('close', handleClose)
      reply.raw.end()
    }
  }

  private async replayExistingRun(agentRun: {
    status: string
    output: string | null
    error: string | null
  }, reply: FastifyReply) {
    if (agentRun.status === 'completed') {
      if (agentRun.output) sendSSE(reply, { type: 'text_delta', data: { text: agentRun.output } })
      sendSSE(reply, { type: 'status', data: { status: 'idle' } })
      return
    }

    if (agentRun.status === 'failed') {
      sendSSE(reply, { type: 'error', data: { message: agentRun.error ?? 'Agent run failed' } })
      return
    }

    sendSSE(reply, { type: 'status', data: { status: 'thinking' } })
    sendSSE(reply, {
      type: 'error',
      data: { message: `This request is already ${agentRun.status}; wait for the active run to finish.` },
    })
  }

  private async executeRun(
    conversationId: string,
    runId: string,
    reply: FastifyReply,
    signal: AbortSignal,
  ) {
    const conversation = await this.conversationService.get(conversationId)
    const project = await prisma.project.findUnique({ where: { id: conversation.projectId } })
    if (!project) throw new Error(`Project not found: ${conversation.projectId}`)

    const { agent, cfg } = createCodingAgent({ workspace: project.rootPath })
    const sessionId = await this.conversationService.getSessionId(conversationId)
    const session = new PrismaAgentSession(sessionId)

    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    })
    await this.eventStore.append(runId, 'run.started', { conversationId })
    sendSSE(reply, { type: 'status', data: { status: 'thinking' } })

    try {
      const stream = await run(agent, await this.getRunInput(agent, runId), {
        maxTurns: cfg.maxTurns,
        stream: true,
        session,
        signal,
      })

      const completedStream = await this.drainStream(agent, stream, runId, reply, session, cfg.maxTurns, signal)
      const finalOutput = typeof completedStream.finalOutput === 'string'
        ? completedStream.finalOutput
        : completedStream.finalOutput == null
          ? ''
          : JSON.stringify(completedStream.finalOutput)

      if (finalOutput) {
        await prisma.message.create({
          data: {
            conversationId,
            runId,
            role: 'assistant',
            content: finalOutput,
          },
        })
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })

      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          output: finalOutput || null,
          state: null,
          finishedAt: new Date(),
        },
      })
      await this.eventStore.append(runId, 'run.completed', { output: finalOutput })
      sendSSE(reply, { type: 'status', data: { status: 'idle' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: signal.aborted ? 'cancelled' : 'failed',
          error: signal.aborted ? 'Run cancelled by client' : message,
          finishedAt: new Date(),
        },
      })
      await this.eventStore.append(runId, signal.aborted ? 'run.cancelled' : 'run.failed', {
        error: signal.aborted ? 'Run cancelled by client' : message,
      })
      if (!signal.aborted) sendSSE(reply, { type: 'error', data: { message } })
    }
  }

  private async getRunInput(agent: Agent, runId: string): Promise<any> {
    const agentRun = await prisma.agentRun.findUnique({ where: { id: runId } })
    if (!agentRun) throw new Error(`Run not found: ${runId}`)
    if (agentRun.state) return RunState.fromString(agent, agentRun.state)
    return agentRun.input
  }

  private async drainStream(
    agent: Agent,
    stream: any,
    runId: string,
    reply: FastifyReply,
    session: PrismaAgentSession,
    maxTurns: number,
    signal: AbortSignal,
  ): Promise<any> {
    for await (const event of stream as AsyncIterable<RunStreamEvent>) {
      await this.handleStreamEvent(runId, event, reply)
    }

    await stream.completed
    const interruptions = stream.interruptions ?? []
    if (interruptions.length === 0) return stream

    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'waiting_approval', state: stream.state.toString() },
    })

    for (const interruption of interruptions) {
      const rawItem = (interruption as { rawItem?: unknown }).rawItem as Record<string, unknown> | undefined
      const callId = String(rawItem?.callId ?? rawItem?.id ?? 'unknown')
      const name = String(rawItem?.name ?? 'unknown')
      const argumentsValue = rawItem?.arguments ?? '{}'
      let args: unknown = argumentsValue
      if (typeof argumentsValue === 'string') {
        try { args = JSON.parse(argumentsValue) } catch { args = argumentsValue }
      }

      await this.approvalService.createApproval({
        runId,
        toolCallId: callId,
        toolName: name,
        arguments: args,
      })
      await this.eventStore.append(runId, 'approval.requested', { id: callId, name, args })
      sendSSE(reply, {
        type: 'tool_call_awaiting_approval',
        data: { id: callId, name, args },
      })

      const approval = await this.approvalService.waitForApproval(callId, runId)
      if (approval) stream.state.approve(interruption)
      else stream.state.reject(interruption)
    }

    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'running', state: stream.state.toString() },
    })

    const resumed = await run(agent, stream.state, {
      maxTurns,
      stream: true,
      session,
      signal,
    })
    return this.drainStream(agent, resumed, runId, reply, session, maxTurns, signal)
  }

  private async handleStreamEvent(runId: string, event: RunStreamEvent, reply: FastifyReply) {
    if (event.type === 'raw_model_stream_event') {
      const data = (event as { data?: { type?: string; delta?: string } }).data
      if (data?.type === 'output_text_delta' && data.delta) {
        await this.eventStore.append(runId, 'message.delta', { text: data.delta })
        sendSSE(reply, { type: 'text_delta', data: { text: data.delta } })
      }
      return
    }

    if (event.type !== 'run_item_stream_event') return
    const item = (event as { item?: { type?: string; rawItem?: unknown } }).item
    if (!item) return
    const raw = (item.rawItem ?? {}) as Record<string, unknown>

    if (event.name === 'tool_called' && item.type === 'tool_call_item') {
      const id = String(raw.callId ?? raw.id ?? 'unknown')
      const name = String(raw.name ?? 'unknown')
      await this.eventStore.append(runId, 'tool.called', { id, name })
      sendSSE(reply, { type: 'tool_call_start', data: { id, name } })
    }

    if (event.name === 'tool_output' && item.type === 'tool_call_output_item') {
      const id = String(raw.callId ?? raw.id ?? 'unknown')
      const result = raw.output
      await this.eventStore.append(runId, 'tool.output', { id, result })
      sendSSE(reply, { type: 'tool_call_completed', data: { id, result } })
    }
  }
}

import type { AgentRun } from '@prisma/client'
import type { AnyTimelineEvent } from '@cloudagent/core'
import { prisma } from '../../db/client.js'
import { appendTimelineEvent } from '../events/timeline-event-store.js'
import {
  PrismaAgentSessionLifecycleRepository,
  type AgentSessionLifecycleRepository,
} from '../history/session-lifecycle-repository.js'

export type PendingApproval = {
  toolCallId: string
  toolName: string
  arguments: unknown
}

export interface AgentRunRepository {
  get(id: string): Promise<AgentRun | null>
  updateStateIfOwned(id: string, state: string, leaseOwner: string): Promise<void>
  heartbeatIfOwned(id: string, leaseOwner: string): Promise<void>
  waitForApprovals(
    id: string,
    conversationId: string,
    state: string,
    leaseOwner: string,
    approvals: PendingApproval[],
  ): Promise<AnyTimelineEvent[]>
  complete(id: string, conversationId: string, output: string, leaseOwner: string): Promise<AnyTimelineEvent>
}

export class PrismaAgentRunRepository implements AgentRunRepository {
  constructor(
    private readonly sessionLifecycleRepository: AgentSessionLifecycleRepository = new PrismaAgentSessionLifecycleRepository(),
  ) {}

  get(id: string) {
    return prisma.agentRun.findUnique({ where: { id } })
  }

  async updateStateIfOwned(id: string, state: string, leaseOwner: string) {
    const updated = await prisma.agentRun.updateMany({
      where: { id, status: 'running', leaseOwner },
      data: { state },
    })
    if (updated.count !== 1) throw new Error(`Run lease lost: ${id}`)
  }

  async heartbeatIfOwned(id: string, leaseOwner: string) {
    const updated = await prisma.agentRun.updateMany({
      where: { id, status: 'running', leaseOwner },
      data: { lastHeartbeatAt: new Date() },
    })
    if (updated.count !== 1) throw new Error(`Run lease lost: ${id}`)
  }

  async waitForApprovals(id: string, conversationId: string, state: string, leaseOwner: string, approvals: PendingApproval[]) {
    const events: AnyTimelineEvent[] = []
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id, status: 'running', leaseOwner },
        data: {
          status: 'waiting_approval',
          state,
          lastHeartbeatAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      if (updated.count !== 1) throw new Error(`Run lease lost: ${id}`)
      const released = await tx.conversation.updateMany({
        where: { id: conversationId, activeRunId: id },
        data: { activeRunId: null },
      })
      if (released.count !== 1) throw new Error(`Conversation active run lease lost: ${conversationId}`)
      await this.sessionLifecycleRepository.touchByConversation(conversationId, tx)
      events.push(await appendTimelineEvent(tx, conversationId, id, 'run.waiting_approval', {}))
      for (const approval of approvals) {
        await tx.approval.upsert({
          where: { toolCallId: approval.toolCallId },
          create: {
            runId: id,
            toolCallId: approval.toolCallId,
            toolName: approval.toolName,
            arguments: JSON.stringify(approval.arguments),
            status: 'pending',
          },
          update: {
            runId: id,
            toolName: approval.toolName,
            arguments: JSON.stringify(approval.arguments),
            status: 'pending',
            decision: null,
            resolvedAt: null,
          },
        })
        events.push(await appendTimelineEvent(tx, conversationId, id, 'tool.awaiting_approval', {
          toolCallId: approval.toolCallId,
          name: approval.toolName,
          args: approval.arguments,
        }))
      }
    })
    return events
  }

  async complete(id: string, conversationId: string, output: string, leaseOwner: string) {
    let completedEvent: AnyTimelineEvent | undefined
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id, status: 'running', leaseOwner },
        data: {
          status: 'completed',
          output: output || null,
          state: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      })
      if (updated.count !== 1) throw new Error(`Run lease lost: ${id}`)
      if (output) {
        await tx.message.upsert({
          where: { id },
          create: { id, conversationId, runId: id, role: 'assistant', content: output },
          update: { content: output },
        })
      }
      const released = await tx.conversation.updateMany({
        where: { id: conversationId, activeRunId: id },
        data: { updatedAt: new Date(), activeRunId: null },
      })
      if (released.count !== 1) throw new Error(`Conversation active run lease lost: ${conversationId}`)
      await this.sessionLifecycleRepository.touchByConversation(conversationId, tx)
      completedEvent = await appendTimelineEvent(tx, conversationId, id, 'run.completed', { output })
    })
    return completedEvent!
  }
}

import type { AgentRun } from '@prisma/client'
import type { AnyTimelineEvent } from '@superagent/core'
import { prisma } from '../../db/client.js'
import { appendTimelineEvent } from '../events/timeline-event-store.js'

export class PrismaRunLifecycleRepository {
  get(id: string) {
    return prisma.agentRun.findUnique({ where: { id } })
  }

  async touchQueued(id: string) {
    await prisma.agentRun.updateMany({
      where: { id, status: 'queued' },
      data: { lastHeartbeatAt: new Date() },
    })
  }

  requestCancel(id: string) {
    return prisma.agentRun.update({ where: { id }, data: { cancelRequestedAt: new Date() } })
  }

  async cancel(run: AgentRun): Promise<AnyTimelineEvent | undefined> {
    let event: AnyTimelineEvent | undefined
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id: run.id, status: { in: ['queued', 'waiting_approval'] } },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      if (updated.count !== 1) return
      await tx.conversation.updateMany({
        where: { id: run.conversationId, activeRunId: run.id },
        data: { activeRunId: null },
      })
      event = await appendTimelineEvent(tx, run.conversationId, run.id, 'run.cancelled', {
        error: 'Run cancelled by user',
      })
    })
    return event
  }

  async findWaitingIds() {
    return prisma.agentRun.findMany({
      where: { status: 'waiting_approval', state: { not: null } },
      select: { id: true },
    })
  }

  async promoteWaiting(id: string) {
    const updated = await prisma.agentRun.updateMany({
      where: { id, status: 'waiting_approval' },
      data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
    })
    if (updated.count !== 1) return
    await prisma.conversation.updateMany({ where: { activeRunId: id }, data: { activeRunId: null } })
  }

  async fail(runId: string, conversationId: string, status: 'failed' | 'cancelled', message: string, owner: string) {
    let event: AnyTimelineEvent | undefined
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id: runId, status: 'running', leaseOwner: owner },
        data: {
          status,
          error: message,
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      if (updated.count !== 1) return
      await tx.conversation.updateMany({ where: { id: conversationId, activeRunId: runId }, data: { activeRunId: null } })
      event = await appendTimelineEvent(tx, conversationId, runId, status === 'cancelled' ? 'run.cancelled' : 'run.failed', { error: message })
    })
    return event
  }

  findRunning() {
    return prisma.agentRun.findMany({ where: { status: 'running' } })
  }

  async recoverRunning(run: AgentRun) {
    if (run.state) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
      })
      await this.releaseConversation(run)
      return undefined
    }
    return this.interrupt(run, 'Server restarted before a resumable checkpoint was saved')
  }

  findWaiting() {
    return prisma.agentRun.findMany({ where: { status: 'waiting_approval' } })
  }

  async recoverWaiting(run: AgentRun, hasPendingApproval: boolean) {
    if (!run.state) return this.interrupt(run, 'Run reached waiting_approval without a resumable checkpoint')
    if (!hasPendingApproval) {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null } })
    } else {
      await prisma.agentRun.update({ where: { id: run.id }, data: { leaseOwner: null, leaseExpiresAt: null } })
    }
    await this.releaseConversation(run)
    return undefined
  }

  async refreshOwnedLeases(runIds: string[], owner: string, leaseMs: number) {
    if (runIds.length === 0) return
    const now = new Date()
    await prisma.agentRun.updateMany({
      where: { id: { in: runIds }, status: 'running', leaseOwner: owner },
      data: { leaseExpiresAt: new Date(now.getTime() + leaseMs), lastHeartbeatAt: now },
    })
  }

  findExpired() {
    return prisma.agentRun.findMany({ where: { status: 'running', leaseExpiresAt: { lte: new Date() } } })
  }

  async recoverExpired(run: AgentRun) {
    if (run.state) {
      const updated = await prisma.agentRun.updateMany({
        where: { id: run.id, status: 'running', leaseExpiresAt: { lte: new Date() } },
        data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
      })
      if (updated.count !== 1) return undefined
      await this.releaseConversation(run)
      return undefined
    }
    return this.interrupt(run, 'Run lease expired before a resumable checkpoint was saved', true)
  }

  private async interrupt(run: AgentRun, error: string, expired = false) {
    let event: AnyTimelineEvent | undefined
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: {
          id: run.id,
          ...(expired ? { status: 'running', leaseExpiresAt: { lte: new Date() } } : {}),
        },
        data: { status: 'interrupted', error, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      })
      if (updated.count !== 1) return
      await tx.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      event = await appendTimelineEvent(tx, run.conversationId, run.id, 'run.interrupted', { error })
    })
    return event
  }

  private releaseConversation(run: AgentRun) {
    return prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
  }
}

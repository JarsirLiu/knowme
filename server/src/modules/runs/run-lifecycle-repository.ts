import type { AgentRun, Prisma } from '@prisma/client'
import type { AnyTimelineEvent } from '@superagent/core'
import { prisma } from '../../db/client.js'
import { appendTimelineEvent } from '../events/timeline-event-store.js'
import {
  PrismaAgentSessionLifecycleRepository,
  type AgentSessionLifecycleRepository,
} from '../history/session-lifecycle-repository.js'

const ACTIVE_RUN_STATUSES = ['queued', 'running', 'waiting_approval']

/** Owns durable Run state transitions that are independent of Agent execution. */
export class PrismaRunLifecycleRepository {
  constructor(
    private readonly sessionLifecycleRepository: AgentSessionLifecycleRepository = new PrismaAgentSessionLifecycleRepository(),
  ) {}

  get(id: string) {
    return prisma.agentRun.findUnique({ where: { id } })
  }

  async touchQueued(id: string) {
    await prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findUnique({ where: { id }, select: { conversationId: true, status: true } })
      if (!run) return
      const updated = await tx.agentRun.updateMany({
        where: { id, status: 'queued' },
        data: { lastHeartbeatAt: new Date() },
      })
      if (updated.count === 1) await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
    })
  }

  async requestCancel(id: string) {
    await prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findUnique({ where: { id }, select: { conversationId: true } })
      if (!run) return
      const updated = await tx.agentRun.updateMany({
        where: { id, status: { in: ACTIVE_RUN_STATUSES } },
        data: { cancelRequestedAt: new Date() },
      })
      if (updated.count === 1) await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
    })
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
      await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
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
    return prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id, status: 'waiting_approval' },
        data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
      })
      if (updated.count !== 1) return false

      const run = await tx.agentRun.findUnique({ where: { id }, select: { conversationId: true } })
      if (!run) return false
      await tx.conversation.updateMany({ where: { id: run.conversationId, activeRunId: id }, data: { activeRunId: null } })
      await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
      return true
    })
  }

  async requeueFromCheckpoint(id: string, conversationId: string, state: string, owner: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id, status: 'running', leaseOwner: owner },
        data: {
          status: 'queued',
          state,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: new Date(),
        },
      })
      if (updated.count !== 1) return false
      await tx.conversation.updateMany({
        where: { id: conversationId, activeRunId: id },
        data: { activeRunId: null },
      })
      await this.sessionLifecycleRepository.touchByConversation(conversationId, tx)
      return true
    })
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
      await this.sessionLifecycleRepository.touchByConversation(conversationId, tx)
      event = await appendTimelineEvent(tx, conversationId, runId, status === 'cancelled' ? 'run.cancelled' : 'run.failed', { error: message })
    })
    return event
  }

  findRunning() {
    return prisma.agentRun.findMany({ where: { status: 'running' } })
  }

  async recoverRunning(run: AgentRun, maxRecoveryAttempts: number) {
    if (run.state && run.attempt < maxRecoveryAttempts) {
      return this.requeueStale(run)
    }
    return this.interrupt(run, run.state
      ? 'Run recovery attempt limit reached after server restart'
      : 'Server restarted before a resumable checkpoint was saved')
  }

  findWaiting() {
    return prisma.agentRun.findMany({ where: { status: 'waiting_approval' } })
  }

  async recoverWaiting(run: AgentRun, hasPendingApproval: boolean) {
    if (!run.state) return this.interrupt(run, 'Run reached waiting_approval without a resumable checkpoint', 'waiting')

    return prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: {
          id: run.id,
          status: 'waiting_approval',
          state: run.state,
          ...leaseSnapshotWhere(run),
        },
        data: hasPendingApproval
          ? { leaseOwner: null, leaseExpiresAt: null }
          : { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
      })
      if (updated.count !== 1) return undefined
      await tx.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
      return undefined
    })
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

  async recoverExpired(run: AgentRun, maxRecoveryAttempts: number) {
    if (run.state && run.attempt < maxRecoveryAttempts) {
      return this.requeueStale(run, true)
    }
    return this.interrupt(run, run.state
      ? 'Run recovery attempt limit reached after lease expiry'
      : 'Run lease expired before a resumable checkpoint was saved', 'expired')
  }

  private async requeueStale(run: AgentRun, expired = false) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: {
          ...leaseSnapshotWhere(run, expired),
        },
        data: {
          status: 'queued',
          leaseOwner: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: new Date(),
        },
      })
      if (updated.count !== 1) return undefined
      await tx.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
      return undefined
    })
  }

  private async interrupt(run: AgentRun, error: string, mode: 'restart' | 'expired' | 'waiting' = 'restart') {
    let event: AnyTimelineEvent | undefined
    await prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: {
          ...leaseSnapshotWhere(run, mode === 'expired'),
          ...(mode === 'waiting' ? { status: 'waiting_approval', state: run.state } : {}),
        },
        data: { status: 'interrupted', error, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      })
      if (updated.count !== 1) return
      await tx.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      await this.sessionLifecycleRepository.touchByConversation(run.conversationId, tx)
      event = await appendTimelineEvent(tx, run.conversationId, run.id, 'run.interrupted', { error })
    })
    return event
  }
}

function leaseSnapshotWhere(run: Pick<AgentRun, 'id' | 'status' | 'leaseOwner' | 'leaseExpiresAt'>, expired = false): Prisma.AgentRunWhereInput {
  const where: Prisma.AgentRunWhereInput = {
    id: run.id,
    status: run.status,
    leaseOwner: run.leaseOwner,
  }
  if (run.leaseExpiresAt === null) {
    where.leaseExpiresAt = null
  } else {
    where.leaseExpiresAt = expired
      ? { equals: run.leaseExpiresAt, lte: new Date() }
      : run.leaseExpiresAt
  }
  return where
}

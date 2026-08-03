import { randomUUID } from 'node:crypto'
import { prisma } from '../../db/client.js'
import { ensureDatabase } from '../../db/ensure-database.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { AgentRunExecutor } from '../chat/agent-run-executor.js'

const LEASE_MS = 30_000
const POLL_MS = 500
const ACTIVE_STATUSES = ['running', 'waiting_approval']

/** Owns durable AgentRun execution. HTTP handlers only enqueue work. */
export class RunCoordinator {
  private readonly owner = randomUUID()
  private readonly executor: AgentRunExecutor
  private readonly controllers = new Map<string, AbortController>()
  private readonly executions = new Set<Promise<void>>()
  private timer: NodeJS.Timeout | undefined
  private ticking = false
  private stopping = false

  constructor(
    private readonly conversationService: ConversationService,
    private readonly approvalService: ApprovalService,
    private readonly timelineStore: TimelineEventStore,
  ) {
    this.executor = new AgentRunExecutor(conversationService, approvalService, timelineStore)
  }

  async start(): Promise<void> {
    this.stopping = false
    await ensureDatabase()
    await this.recoverAfterRestart()
    this.timer = setInterval(() => { void this.tick().catch(() => undefined) }, POLL_MS)
    await this.tick()
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
    await Promise.allSettled([...this.executions])
  }

  async enqueue(runId: string): Promise<void> {
    if (this.stopping) return
    await prisma.agentRun.updateMany({
      where: { id: runId, status: 'queued' },
      data: { lastHeartbeatAt: new Date() },
    })
    await this.tick()
  }

  async cancel(runId: string): Promise<boolean> {
    const run = await prisma.agentRun.findUnique({ where: { id: runId } })
    if (!run) return false
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) return false

    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequestedAt: new Date() } })
    this.controllers.get(runId)?.abort()
    if (run.status === 'queued' || run.status === 'waiting_approval') {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'cancelled', finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      })
      await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: runId }, data: { activeRunId: null } })
      await this.timelineStore.append(run.conversationId, runId, 'run.cancelled', { error: 'Run cancelled by user' })
    }
    return true
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.ticking) return
    this.ticking = true
    try {
      await this.refreshOwnedLeases()
      await this.recoverExpiredRuns()
      await this.promoteResolvedApprovals()
      for (;;) {
        const claimed = await this.claimNext()
        if (!claimed) return
        const execution = this.executeClaimed(claimed.id)
        this.executions.add(execution)
        void execution.finally(() => this.executions.delete(execution)).catch(() => undefined)
      }
    } finally {
      this.ticking = false
    }
  }

  private async promoteResolvedApprovals(): Promise<void> {
    const waiting = await prisma.agentRun.findMany({ where: { status: 'waiting_approval', state: { not: null } }, select: { id: true } })
    for (const run of waiting) {
      if ((await this.approvalService.getPendingForRun(run.id)).length > 0) continue
      await prisma.agentRun.updateMany({
        where: { id: run.id, status: 'waiting_approval' },
        data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
      })
      await prisma.conversation.updateMany({ where: { activeRunId: run.id }, data: { activeRunId: null } })
    }
  }

  private async claimNext() {
    const candidates = await prisma.agentRun.findMany({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
      take: 32,
    })
    for (const candidate of candidates) {
      const claimed = await prisma.$transaction(async (tx) => {
        // Take the conversation row write lock before checking active runs. The
        // conditional activeRunId update alone is not enough under SQLite's
        // deferred transaction snapshots when two coordinators start together.
        const conversation = await tx.conversation.update({
          where: { id: candidate.conversationId },
          data: { updatedAt: new Date() },
          select: { activeRunId: true },
        })

        if (conversation.activeRunId) {
          const activeRun = await tx.agentRun.findUnique({
            where: { id: conversation.activeRunId },
            select: { status: true },
          })
          if (activeRun && ACTIVE_STATUSES.includes(activeRun.status)) return null
          await tx.conversation.updateMany({
            where: { id: candidate.conversationId, activeRunId: conversation.activeRunId },
            data: { activeRunId: null },
          })
        }

        const reserved = await tx.conversation.updateMany({
          where: { id: candidate.conversationId, activeRunId: null },
          data: { activeRunId: candidate.id },
        })
        if (reserved.count !== 1) return null

        const active = await tx.agentRun.findFirst({
          where: {
            conversationId: candidate.conversationId,
            status: { in: ACTIVE_STATUSES },
            id: { not: candidate.id },
          },
          select: { id: true },
        })
        if (active) {
          await tx.conversation.updateMany({ where: { id: candidate.conversationId, activeRunId: candidate.id }, data: { activeRunId: null } })
          return null
        }
        const updated = await tx.agentRun.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: {
            status: 'running',
            attempt: { increment: 1 },
            leaseOwner: this.owner,
            leaseExpiresAt: new Date(Date.now() + LEASE_MS),
            startedAt: candidate.startedAt ?? new Date(),
            lastHeartbeatAt: new Date(),
          },
        })
        if (updated.count !== 1) {
          await tx.conversation.updateMany({ where: { id: candidate.conversationId, activeRunId: candidate.id }, data: { activeRunId: null } })
          return null
        }
        return tx.agentRun.findUnique({ where: { id: candidate.id } })
      })
      if (claimed) return claimed
    }
    return null
  }

  private async executeClaimed(runId: string): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    try {
      const run = await prisma.agentRun.findUnique({ where: { id: runId } })
      if (!run) return
      const resumed = run.attempt > 1 || Boolean(run.state)
      await this.executor.execute(runId, controller.signal, resumed, this.owner)
    } catch (error) {
      const current = await prisma.agentRun.findUnique({ where: { id: runId } })
      if (!current || current.status !== 'running' || current.leaseOwner !== this.owner) return
      const cancelled = controller.signal.aborted || Boolean(current.cancelRequestedAt)
      const message = cancelled ? 'Run cancelled by user' : error instanceof Error ? error.message : String(error)
      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: cancelled ? 'cancelled' : 'failed',
          error: message,
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      await prisma.conversation.updateMany({ where: { id: current.conversationId, activeRunId: runId }, data: { activeRunId: null } })
      await this.timelineStore.append(current.conversationId, runId, cancelled ? 'run.cancelled' : 'run.failed', { error: message })
    } finally {
      this.controllers.delete(runId)
      await this.tick().catch(() => undefined)
    }
  }

  private async recoverAfterRestart(): Promise<void> {
    const now = new Date()
    const running = await prisma.agentRun.findMany({ where: { status: 'running' } })
    for (const run of running) {
      if (run.leaseExpiresAt && run.leaseExpiresAt > now) continue
      if (run.state) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
        })
        await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      } else {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'interrupted', error: 'Server restarted before a resumable checkpoint was saved', finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
        })
        await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
        await this.timelineStore.append(run.conversationId, run.id, 'run.interrupted', {
          error: 'Server restarted before a resumable checkpoint was saved',
        })
      }
    }

    const waiting = await prisma.agentRun.findMany({ where: { status: 'waiting_approval' } })
    for (const run of waiting) {
      if (!run.state) {
        const error = 'Run reached waiting_approval without a resumable checkpoint'
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'interrupted', error, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
        })
        await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
        await this.timelineStore.append(run.conversationId, run.id, 'run.interrupted', { error })
        continue
      }
      if ((await this.approvalService.getPendingForRun(run.id)).length === 0) {
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null } })
        await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      } else {
        await prisma.agentRun.update({ where: { id: run.id }, data: { leaseOwner: null, leaseExpiresAt: null } })
        await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      }
    }
  }

  private async refreshOwnedLeases(): Promise<void> {
    const runIds = [...this.controllers.keys()]
    if (runIds.length === 0) return
    const now = new Date()
    await prisma.agentRun.updateMany({
      where: { id: { in: runIds }, status: 'running', leaseOwner: this.owner },
      data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastHeartbeatAt: now },
    })
  }

  private async recoverExpiredRuns(): Promise<void> {
    const expired = await prisma.agentRun.findMany({
      where: { status: 'running', leaseExpiresAt: { lte: new Date() } },
    })
    for (const run of expired) {
      const error = 'Run lease expired before a resumable checkpoint was saved'
      const updated = run.state
        ? await prisma.agentRun.updateMany({
          where: { id: run.id, status: 'running', leaseExpiresAt: { lte: new Date() } },
          data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
        })
        : await prisma.agentRun.updateMany({
          where: { id: run.id, status: 'running', leaseExpiresAt: { lte: new Date() } },
          data: { status: 'interrupted', error, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
        })
      if (updated.count !== 1) continue
      await prisma.conversation.updateMany({ where: { id: run.conversationId, activeRunId: run.id }, data: { activeRunId: null } })
      if (!run.state) await this.timelineStore.append(run.conversationId, run.id, 'run.interrupted', { error })
    }
  }
}

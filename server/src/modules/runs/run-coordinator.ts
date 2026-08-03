import { randomUUID } from 'node:crypto'
import { prisma } from '../../db/client.js'
import { ensureDatabase } from '../../db/ensure-database.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { AgentRunExecutor } from '../chat/agent-run-executor.js'

const LEASE_MS = 30_000
const POLL_MS = 500

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
      await this.timelineStore.append(run.conversationId, runId, 'run.cancelled', { error: 'Run cancelled by user' })
    }
    return true
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.ticking) return
    this.ticking = true
    try {
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
        const active = await tx.agentRun.findFirst({
          where: {
            conversationId: candidate.conversationId,
            status: { in: ['running', 'waiting_approval'] },
          },
          select: { id: true },
        })
        if (active) return null
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
        return updated.count === 1 ? tx.agentRun.findUnique({ where: { id: candidate.id } }) : null
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
      await this.executor.execute(runId, controller.signal, resumed)
    } catch (error) {
      const current = await prisma.agentRun.findUnique({ where: { id: runId } })
      if (!current || ['completed', 'waiting_approval', 'cancelled'].includes(current.status)) return
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
      await this.timelineStore.append(current.conversationId, runId, cancelled ? 'run.cancelled' : 'run.failed', { error: message })
    } finally {
      this.controllers.delete(runId)
      await this.tick().catch(() => undefined)
    }
  }

  private async recoverAfterRestart(): Promise<void> {
    const running = await prisma.agentRun.findMany({ where: { status: 'running' } })
    for (const run of running) {
      if (run.state) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null, lastHeartbeatAt: new Date() },
        })
      } else {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'interrupted', error: 'Server restarted before a resumable checkpoint was saved', finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
        })
        await this.timelineStore.append(run.conversationId, run.id, 'run.interrupted', {
          error: 'Server restarted before a resumable checkpoint was saved',
        })
      }
    }

    const waiting = await prisma.agentRun.findMany({ where: { status: 'waiting_approval' } })
    for (const run of waiting) {
      if (!run.state) continue
      if ((await this.approvalService.getPendingForRun(run.id)).length === 0) {
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'queued', leaseOwner: null, leaseExpiresAt: null } })
      }
    }
  }
}

import { randomUUID } from 'node:crypto'
import { ensureDatabase } from '../../db/ensure-database.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { AgentRunExecutor } from '../chat/agent-run-executor.js'
import { RunScheduler } from './run-scheduler.js'
import { PrismaRunLifecycleRepository } from './run-lifecycle-repository.js'

const LEASE_MS = 30_000
const POLL_MS = 500
const MAX_RECOVERY_ATTEMPTS = 3
const DEFAULT_MAX_CONCURRENT_RUNS = 4

/** Coordinates durable run scheduling and execution without owning persistence details. */
export class RunCoordinator {
  private readonly owner = randomUUID()
  private readonly executor: AgentRunExecutor
  private readonly scheduler: RunScheduler
  private readonly lifecycleRepository: PrismaRunLifecycleRepository
  private readonly controllers = new Map<string, AbortController>()
  private readonly executions = new Set<Promise<void>>()
  private timer: NodeJS.Timeout | undefined
  private ticking = false
  private stopping = false
  private readonly maxConcurrentRuns: number

  constructor(
    conversationService: ConversationService,
    private readonly approvalService: ApprovalService,
    private readonly timelineStore: TimelineEventStore,
    executor?: AgentRunExecutor,
    scheduler?: RunScheduler,
    lifecycleRepository?: PrismaRunLifecycleRepository,
    maxConcurrentRuns = Number(process.env.SUPERAGENT_MAX_CONCURRENT_RUNS || DEFAULT_MAX_CONCURRENT_RUNS),
  ) {
    this.executor = executor ?? new AgentRunExecutor(conversationService, approvalService, timelineStore)
    this.scheduler = scheduler ?? new RunScheduler()
    this.lifecycleRepository = lifecycleRepository ?? new PrismaRunLifecycleRepository()
    this.maxConcurrentRuns = Number.isFinite(maxConcurrentRuns) && maxConcurrentRuns > 0
      ? Math.floor(maxConcurrentRuns)
      : DEFAULT_MAX_CONCURRENT_RUNS
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
    await this.lifecycleRepository.touchQueued(runId)
    await this.tick()
  }

  async cancel(runId: string): Promise<boolean> {
    const run = await this.lifecycleRepository.get(runId)
    if (!run) return false
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) return false

    await this.lifecycleRepository.requestCancel(runId)
    this.controllers.get(runId)?.abort()
    if (run.status === 'queued' || run.status === 'waiting_approval') {
      const event = await this.lifecycleRepository.cancel(run)
      if (event) this.timelineStore.publish(event)
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
        if (this.executions.size >= this.maxConcurrentRuns) return
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
    const waiting = await this.lifecycleRepository.findWaitingIds()
    for (const run of waiting) {
      if ((await this.approvalService.getPendingForRun(run.id)).length > 0) continue
      await this.lifecycleRepository.promoteWaiting(run.id)
    }
  }

  private claimNext() {
    return this.scheduler.claimNext(this.owner)
  }

  private async executeClaimed(runId: string): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    try {
      const run = await this.lifecycleRepository.get(runId)
      if (!run) return
      const resumed = run.attempt > 1 || Boolean(run.state)
      await this.executor.execute(runId, controller.signal, resumed, this.owner)
    } catch (error) {
      const current = await this.lifecycleRepository.get(runId)
      if (!current || current.status !== 'running' || current.leaseOwner !== this.owner) return
      const cancelled = !this.stopping && (controller.signal.aborted || Boolean(current.cancelRequestedAt))
      if (!cancelled && current.state && current.attempt < MAX_RECOVERY_ATTEMPTS) {
        await this.retryFromCheckpoint(current, current.state)
        return
      }
      const message = cancelled ? 'Run cancelled by user' : error instanceof Error ? error.message : String(error)
      const event = await this.lifecycleRepository.fail(
        runId,
        current.conversationId,
        cancelled ? 'cancelled' : 'failed',
        message,
        this.owner,
      )
      if (event) this.timelineStore.publish(event)
    } finally {
      this.controllers.delete(runId)
      await this.tick().catch(() => undefined)
    }
  }

  private async retryFromCheckpoint(run: { id: string; conversationId: string; leaseOwner: string | null }, state: string) {
    if (!run.leaseOwner) return
    await this.lifecycleRepository.requeueFromCheckpoint(run.id, run.conversationId, state, run.leaseOwner)
  }

  private async recoverAfterRestart(): Promise<void> {
    const now = new Date()
    const running = await this.lifecycleRepository.findRunning()
    for (const run of running) {
      if (run.leaseExpiresAt && run.leaseExpiresAt > now) continue
      const event = await this.lifecycleRepository.recoverRunning(run, MAX_RECOVERY_ATTEMPTS)
      if (event) this.timelineStore.publish(event)
    }

    const waiting = await this.lifecycleRepository.findWaiting()
    for (const run of waiting) {
      const hasPendingApproval = (await this.approvalService.getPendingForRun(run.id)).length > 0
      const event = await this.lifecycleRepository.recoverWaiting(run, hasPendingApproval)
      if (event) this.timelineStore.publish(event)
    }
  }

  private refreshOwnedLeases() {
    return this.lifecycleRepository.refreshOwnedLeases([...this.controllers.keys()], this.owner, LEASE_MS)
  }

  private async recoverExpiredRuns(): Promise<void> {
    const expired = await this.lifecycleRepository.findExpired()
    for (const run of expired) {
      const event = await this.lifecycleRepository.recoverExpired(run, MAX_RECOVERY_ATTEMPTS)
      if (event) this.timelineStore.publish(event)
    }
  }
}

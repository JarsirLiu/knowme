import type { AgentInputItem, Session } from '@openai/agents'
import {
  PrismaAgentSessionRepository,
  type AgentSessionRepository,
} from './agent-session-repository.js'
import {
  SessionCompactionCoordinator,
} from './session-compaction-coordinator.js'
import type {
  CompactionObserver,
  SessionCompactionOptions,
  SessionCompactionResult,
  SessionCompactionTrigger,
} from './session-compaction.js'
import { SessionCompactionService } from './session-compaction.js'
import {
  PrismaSessionCompactionRepository,
  type SessionCompactionRepository,
} from './session-compaction-repository.js'

export class PrismaAgentSession implements Session {
  private readonly compactionCoordinator: SessionCompactionCoordinator

  constructor(
    private readonly sessionId: string,
    compaction?: SessionCompactionOptions,
    observer?: CompactionObserver,
    private readonly repository: AgentSessionRepository = new PrismaAgentSessionRepository(),
    compactionRepository: SessionCompactionRepository = new PrismaSessionCompactionRepository(),
    coordinator?: SessionCompactionCoordinator,
  ) {
    this.compactionCoordinator = coordinator ?? new SessionCompactionCoordinator(
      sessionId,
      compaction,
      observer,
      new SessionCompactionService(compactionRepository),
    )
  }

  async getSessionId(): Promise<string> {
    return this.sessionId
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    return this.repository.getItems(this.sessionId, limit)
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    await this.repository.addItems(this.sessionId, items)
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.repository.popItem(this.sessionId)
  }

  async clearSession(): Promise<void> {
    await this.repository.clearSession(this.sessionId)
  }

  async replaceItems(items: AgentInputItem[]): Promise<void> {
    await this.repository.replaceItems(this.sessionId, items)
  }

  async compact(trigger: SessionCompactionTrigger): Promise<SessionCompactionResult> {
    return this.compactionCoordinator.compact(trigger)
  }

  async runCompaction(): Promise<null> {
    return this.compactionCoordinator.runAutoCompaction()
  }
}

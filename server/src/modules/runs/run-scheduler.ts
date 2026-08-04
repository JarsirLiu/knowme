import type { AgentRun } from '@prisma/client'
import { prisma } from '../../db/client.js'
import {
  PrismaAgentSessionLifecycleRepository,
  type AgentSessionLifecycleRepository,
} from '../history/session-lifecycle-repository.js'

const ACTIVE_STATUSES = ['running', 'waiting_approval']

/** Claims queued work while preserving the one-active-run-per-conversation invariant. */
export class RunScheduler {
  constructor(
    private readonly sessionLifecycleRepository: AgentSessionLifecycleRepository = new PrismaAgentSessionLifecycleRepository(),
  ) {}

  async claimNext(owner: string): Promise<AgentRun | null> {
    const candidates = await prisma.agentRun.findMany({
      where: { status: 'queued', conversation: { status: 'active' } },
      orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
      take: 32,
    })
    for (const candidate of candidates) {
      const claimed = await prisma.$transaction(async (tx) => {
        // Touch the active conversation first so SQLite serializes competing claims.
        const touched = await tx.conversation.updateMany({
          where: { id: candidate.conversationId, status: 'active' },
          data: { updatedAt: new Date() },
        })
        if (touched.count !== 1) return null

        const conversation = await tx.conversation.findUnique({
          where: { id: candidate.conversationId },
          select: { activeRunId: true },
        })
        if (!conversation) return null

        if (conversation.activeRunId === candidate.id) {
          const currentCandidate = await tx.agentRun.findUnique({
            where: { id: candidate.id },
            select: { status: true },
          })
          if (currentCandidate && ACTIVE_STATUSES.includes(currentCandidate.status)) return null
          if (!currentCandidate || currentCandidate.status !== 'queued') {
            await tx.conversation.updateMany({
              where: { id: candidate.conversationId, activeRunId: candidate.id },
              data: { activeRunId: null },
            })
          }
        }

        if (conversation.activeRunId && conversation.activeRunId !== candidate.id) {
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

        if (conversation.activeRunId !== candidate.id) {
          const reserved = await tx.conversation.updateMany({
            where: { id: candidate.conversationId, status: 'active', activeRunId: null },
            data: { activeRunId: candidate.id },
          })
          if (reserved.count !== 1) return null
        }

        const active = await tx.agentRun.findFirst({
          where: {
            conversationId: candidate.conversationId,
            status: { in: ACTIVE_STATUSES },
            id: { not: candidate.id },
          },
          select: { id: true },
        })
        if (active) {
          await tx.conversation.updateMany({
            where: { id: candidate.conversationId, activeRunId: candidate.id },
            data: { activeRunId: null },
          })
          return null
        }

        const updated = await tx.agentRun.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: {
            status: 'running',
            attempt: { increment: 1 },
            leaseOwner: owner,
            leaseExpiresAt: new Date(Date.now() + 30_000),
            startedAt: candidate.startedAt ?? new Date(),
            lastHeartbeatAt: new Date(),
          },
        })
        if (updated.count !== 1) {
          await tx.conversation.updateMany({
            where: { id: candidate.conversationId, activeRunId: candidate.id },
            data: { activeRunId: null },
          })
          return null
        }
        await this.sessionLifecycleRepository.touchByConversation(candidate.conversationId, tx)
        return tx.agentRun.findUnique({ where: { id: candidate.id } })
      })
      if (claimed) return claimed
    }
    return null
  }
}

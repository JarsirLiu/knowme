import type { AgentRun } from '@prisma/client'
import { prisma } from '../../db/client.js'

const ACTIVE_STATUSES = ['running', 'waiting_approval']

/** Claims queued work while preserving the one-active-run-per-conversation invariant. */
export class RunScheduler {
  async claimNext(owner: string): Promise<AgentRun | null> {
    const candidates = await prisma.agentRun.findMany({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
      take: 32,
    })
    for (const candidate of candidates) {
      const claimed = await prisma.$transaction(async (tx) => {
        // Touch the conversation first so SQLite serializes competing claims.
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
        return tx.agentRun.findUnique({ where: { id: candidate.id } })
      })
      if (claimed) return claimed
    }
    return null
  }
}

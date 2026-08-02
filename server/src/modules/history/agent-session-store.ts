import type { AgentInputItem, Session } from '@openai/agents'
import { prisma } from '../../db/client.js'
import {
  compactSession,
  replaceSessionItems,
  type SessionCompactionOptions,
  type SessionCompactionResult,
  type SessionCompactionTrigger,
} from './session-compaction.js'

export class PrismaAgentSession implements Session {
  constructor(
    private readonly sessionId: string,
    private readonly compaction?: SessionCompactionOptions,
  ) {}

  async getSessionId(): Promise<string> {
    return this.sessionId
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const items = await prisma.sessionItem.findMany({
      where: { sessionId: this.sessionId },
      orderBy: { sequence: limit === undefined ? 'asc' : 'desc' },
      ...(limit === undefined ? {} : { take: limit }),
    })

    const ordered = limit === undefined ? items : items.reverse()
    return ordered.map((item) => JSON.parse(item.payload) as AgentInputItem)
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) return

    await prisma.$transaction(async (tx) => {
      const last = await tx.sessionItem.findFirst({
        where: { sessionId: this.sessionId },
        orderBy: { sequence: 'desc' },
      })
      let sequence = last?.sequence ?? 0

      for (const item of items) {
        sequence += 1
        await tx.sessionItem.create({
          data: {
            sessionId: this.sessionId,
            sequence,
            itemType: String(item.type),
            payload: JSON.stringify(item),
          },
        })
      }
    })
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const item = await prisma.sessionItem.findFirst({
      where: { sessionId: this.sessionId },
      orderBy: { sequence: 'desc' },
    })
    if (!item) return undefined

    await prisma.sessionItem.delete({ where: { id: item.id } })
    return JSON.parse(item.payload) as AgentInputItem
  }

  async clearSession(): Promise<void> {
    await prisma.sessionItem.deleteMany({ where: { sessionId: this.sessionId } })
  }

  async replaceItems(items: AgentInputItem[]): Promise<void> {
    await replaceSessionItems(this.sessionId, items)
  }

  async compact(trigger: SessionCompactionTrigger): Promise<SessionCompactionResult> {
    if (!this.compaction) {
      return {
        status: 'skipped',
        reason: 'compaction not configured',
        beforeItems: 0,
        afterItems: 0,
        compactedItems: 0,
        keptItems: 0,
        estimatedTokensBefore: 0,
        estimatedTokensAfter: 0,
        predictedInputTokens: 0,
        inputBudgetTokens: 0,
        recentTokenBudget: 0,
      }
    }
    return compactSession(this.sessionId, this.compaction, trigger)
  }

  async runCompaction(): Promise<null> {
    if (!this.compaction) return null

    try {
      await compactSession(this.sessionId, this.compaction, 'auto')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[context-compaction] skipped:', message)
    }

    return null
  }
}

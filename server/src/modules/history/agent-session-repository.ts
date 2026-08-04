import type { AgentInputItem } from '@openai/agents'
import { prisma } from '../../db/client.js'
import {
  PrismaAgentSessionLifecycleRepository,
  type AgentSessionLifecycleRepository,
} from './session-lifecycle-repository.js'

export interface AgentSessionRepository {
  getItems(sessionId: string, limit?: number): Promise<AgentInputItem[]>
  addItems(sessionId: string, items: AgentInputItem[]): Promise<void>
  popItem(sessionId: string): Promise<AgentInputItem | undefined>
  clearSession(sessionId: string): Promise<void>
  replaceItems(sessionId: string, items: AgentInputItem[]): Promise<void>
}

export class PrismaAgentSessionRepository implements AgentSessionRepository {
  constructor(
    private readonly lifecycleRepository: AgentSessionLifecycleRepository = new PrismaAgentSessionLifecycleRepository(),
  ) {}

  async getItems(sessionId: string, limit?: number): Promise<AgentInputItem[]> {
    const items = await prisma.sessionItem.findMany({
      where: { sessionId },
      orderBy: { sequence: limit === undefined ? 'asc' : 'desc' },
      ...(limit === undefined ? {} : { take: limit }),
    })

    const ordered = limit === undefined ? items : items.reverse()
    return ordered.map((item) => JSON.parse(item.payload) as AgentInputItem)
  }

  async addItems(sessionId: string, items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) return

    await prisma.$transaction(async (tx) => {
      const last = await tx.sessionItem.findFirst({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
      })
      let sequence = last?.sequence ?? 0

      for (const item of items) {
        sequence += 1
        await tx.sessionItem.create({
          data: {
            sessionId,
            sequence,
            itemType: String(item.type),
            payload: JSON.stringify(item),
          },
        })
      }
      await this.lifecycleRepository.touch(sessionId, tx)
    })
  }

  async popItem(sessionId: string): Promise<AgentInputItem | undefined> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.sessionItem.findFirst({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
      })
      if (!item) return undefined

      await tx.sessionItem.delete({ where: { id: item.id } })
      await this.lifecycleRepository.touch(sessionId, tx)
      return JSON.parse(item.payload) as AgentInputItem
    })
  }

  async clearSession(sessionId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.sessionItem.deleteMany({ where: { sessionId } })
      await this.lifecycleRepository.touch(sessionId, tx)
    })
  }

  async replaceItems(sessionId: string, items: AgentInputItem[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.sessionItem.deleteMany({ where: { sessionId } })
      for (const [index, item] of items.entries()) {
        await tx.sessionItem.create({
          data: {
            sessionId,
            sequence: index + 1,
            itemType: String(item.type),
            payload: JSON.stringify(item),
          },
        })
      }
      await this.lifecycleRepository.touch(sessionId, tx)
    })
  }
}

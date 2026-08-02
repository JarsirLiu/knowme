import type { AgentInputItem, Session } from '@openai/agents'
import { prisma } from '../../db/client.js'

export class PrismaAgentSession implements Session {
  constructor(private readonly sessionId: string) {}

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
}

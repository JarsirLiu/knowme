import { prisma } from '../db/client.js'

export class SessionManager {
  async create(name?: string) {
    return prisma.session.create({
      data: { name: name || 'New Session' },
    })
  }

  async list() {
    return prisma.session.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
  }

  async get(id: string) {
    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) throw new Error(`Session not found: ${id}`)
    return session
  }

  async delete(id: string) {
    await prisma.session.delete({ where: { id } })
  }

  async getMessages(sessionId: string) {
    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    })
  }
}
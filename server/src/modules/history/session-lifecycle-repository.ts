import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../../db/client.js'

type SessionDatabaseClient = PrismaClient | Prisma.TransactionClient

export interface AgentSessionLifecycleRepository {
  touch(sessionId: string, client?: SessionDatabaseClient): Promise<void>
  touchByConversation(conversationId: string, client?: SessionDatabaseClient): Promise<void>
  archiveByConversation(conversationId: string, client?: SessionDatabaseClient): Promise<void>
}

/** Owns AgentSession lifecycle metadata without coupling callers to Prisma fields. */
export class PrismaAgentSessionLifecycleRepository implements AgentSessionLifecycleRepository {
  async touch(sessionId: string, client: SessionDatabaseClient = prisma): Promise<void> {
    await client.agentSession.updateMany({
      where: { id: sessionId, status: { not: 'deleted' } },
      data: { lastActivityAt: new Date() },
    })
  }

  async touchByConversation(conversationId: string, client: SessionDatabaseClient = prisma): Promise<void> {
    await client.agentSession.updateMany({
      where: { conversationId, status: { not: 'deleted' } },
      data: { lastActivityAt: new Date() },
    })
  }

  async archiveByConversation(conversationId: string, client: SessionDatabaseClient = prisma): Promise<void> {
    await client.agentSession.updateMany({
      where: { conversationId, status: { not: 'deleted' } },
      data: { status: 'archived', archivedAt: new Date(), lastActivityAt: new Date() },
    })
  }
}

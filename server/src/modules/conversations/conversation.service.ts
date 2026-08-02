import { prisma } from '../../db/client.js'

function titleFromMessage(message: string): string {
  const title = message.replace(/\s+/g, ' ').trim()
  if (!title) return 'New Task'
  return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

export class ConversationService {
  async list(projectId: string) {
    return prisma.conversation.findMany({
      where: { projectId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async get(id: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) throw new Error(`Conversation not found: ${id}`)
    return conversation
  }

  async delete(id: string) {
    const conversation = await this.get(id)
    if (conversation.status === 'archived') return conversation

    return prisma.conversation.update({
      where: { id },
      data: {
        status: 'archived',
        updatedAt: new Date(),
      },
    })
  }

  async startTurn(data: {
    projectId: string
    message: string
    clientMessageId: string
  }) {
    const existing = await prisma.agentRun.findFirst({
      where: {
        clientMessageId: data.clientMessageId,
        conversation: { projectId: data.projectId },
      },
      include: { conversation: true },
    })
    if (existing) return { conversation: existing.conversation, run: existing, created: false }

    return prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          projectId: data.projectId,
          title: titleFromMessage(data.message),
        },
      })

      await tx.agentSession.create({
        data: {
          conversationId: conversation.id,
          sessionKey: `local:${conversation.id}`,
        },
      })

      const run = await tx.agentRun.create({
        data: {
          conversationId: conversation.id,
          clientMessageId: data.clientMessageId,
          status: 'queued',
          input: data.message,
        },
      })

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          runId: run.id,
          role: 'user',
          content: data.message,
        },
      })

      return { conversation, run, created: true }
    })
  }

  async continueTurn(data: {
    conversationId: string
    message: string
    clientMessageId: string
  }) {
    const conversation = await this.get(data.conversationId)
    if (conversation.status !== 'active') {
      throw new Error(`Conversation is not active: ${data.conversationId}`)
    }

    const existing = await prisma.agentRun.findFirst({
      where: { conversationId: conversation.id, clientMessageId: data.clientMessageId },
    })
    if (existing) return { conversation, run: existing, created: false }

    const run = await prisma.$transaction(async (tx) => {
      const nextRun = await tx.agentRun.create({
        data: {
          conversationId: conversation.id,
          clientMessageId: data.clientMessageId,
          status: 'queued',
          input: data.message,
        },
      })

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          runId: nextRun.id,
          role: 'user',
          content: data.message,
        },
      })

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })

      return nextRun
    })

    return { conversation, run, created: true }
  }

  async getTimeline(id: string) {
    const conversation = await this.get(id)
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    })

    return { conversation, messages }
  }

  async getSessionId(conversationId: string): Promise<string> {
    const session = await prisma.agentSession.findUnique({
      where: { conversationId },
    })
    if (!session) throw new Error(`Agent session not found for conversation: ${conversationId}`)
    return session.id
  }
}

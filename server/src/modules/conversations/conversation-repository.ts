import type { AgentRun, Conversation } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { appendTimelineEvent } from '../events/timeline-event-store.js'
import type { AnyTimelineEvent } from '@superagent/core'

export type TurnCreation = {
  projectId: string
  message: string
  clientMessageId: string
}

export type ContinuedTurnCreation = {
  conversationId: string
  message: string
  clientMessageId: string
  title: string
}

export interface ConversationRepository {
  list(projectId: string): Promise<Conversation[]>
  get(id: string): Promise<Conversation | null>
  archive(id: string): Promise<Conversation>
  findByClientMessage(projectId: string, clientMessageId: string): Promise<{ conversation: Conversation; run: AgentRun } | null>
  createInitialTurn(data: TurnCreation): Promise<{ conversation: Conversation; run: AgentRun; startedEvent: AnyTimelineEvent }>
  findTurn(conversationId: string, clientMessageId: string): Promise<AgentRun | null>
  createNextTurn(data: ContinuedTurnCreation): Promise<{ run: AgentRun; startedEvent: AnyTimelineEvent }>
  hasActiveRun(conversationId: string): Promise<boolean>
  getSessionId(conversationId: string): Promise<string>
  touch(id: string): Promise<void>
}

export class PrismaConversationRepository implements ConversationRepository {
  async list(projectId: string) {
    return prisma.conversation.findMany({
      where: { projectId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async get(id: string) {
    return prisma.conversation.findUnique({ where: { id } })
  }

  async archive(id: string) {
    return prisma.conversation.update({
      where: { id },
      data: { status: 'archived', updatedAt: new Date() },
    })
  }

  async findByClientMessage(projectId: string, clientMessageId: string) {
    const existing = await prisma.agentRun.findFirst({
      where: { clientMessageId, conversation: { projectId } },
      include: { conversation: true },
    })
    return existing ? { conversation: existing.conversation, run: existing } : null
  }

  async createInitialTurn(data: TurnCreation) {
    return prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          projectId: data.projectId,
          title: titleFromMessage(data.message),
          nextRunSequence: 1,
        },
      })
      await tx.agentSession.create({
        data: { conversationId: conversation.id, sessionKey: `local:${conversation.id}` },
      })
      const run = await tx.agentRun.create({
        data: {
          conversationId: conversation.id,
          clientMessageId: data.clientMessageId,
          sequence: 1,
          status: 'queued',
          input: data.message,
        },
      })
      const userMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          runId: run.id,
          role: 'user',
          content: data.message,
        },
      })
      const startedEvent = await appendTimelineEvent(tx, conversation.id, run.id, 'turn.started', {
        title: conversation.title,
        userMessageId: userMessage.id,
        userText: data.message,
        assistantMessageId: run.id,
      })
      return { conversation, run, startedEvent }
    })
  }

  async findTurn(conversationId: string, clientMessageId: string) {
    return prisma.agentRun.findFirst({ where: { conversationId, clientMessageId } })
  }

  async createNextTurn(data: ContinuedTurnCreation) {
    return prisma.$transaction(async (tx) => {
      const sequence = (await tx.conversation.update({
        where: { id: data.conversationId },
        data: { nextRunSequence: { increment: 1 } },
        select: { nextRunSequence: true },
      })).nextRunSequence
      const run = await tx.agentRun.create({
        data: {
          conversationId: data.conversationId,
          clientMessageId: data.clientMessageId,
          sequence,
          status: 'queued',
          input: data.message,
        },
      })
      const userMessage = await tx.message.create({
        data: {
          conversationId: data.conversationId,
          runId: run.id,
          role: 'user',
          content: data.message,
        },
      })
      await tx.conversation.update({
        where: { id: data.conversationId },
        data: { updatedAt: new Date() },
      })
      const startedEvent = await appendTimelineEvent(tx, data.conversationId, run.id, 'turn.started', {
        title: data.title,
        userMessageId: userMessage.id,
        userText: data.message,
        assistantMessageId: run.id,
      })
      return { run, startedEvent }
    })
  }

  async hasActiveRun(conversationId: string) {
    const run = await prisma.agentRun.findFirst({
      where: { conversationId, status: { in: ['queued', 'running', 'waiting_approval'] } },
      select: { id: true },
    })
    return Boolean(run)
  }

  async getSessionId(conversationId: string) {
    const session = await prisma.agentSession.findUnique({ where: { conversationId } })
    if (!session) throw new Error(`Agent session not found for conversation: ${conversationId}`)
    return session.id
  }

  async touch(id: string) {
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
  }
}

function titleFromMessage(message: string): string {
  const title = message.replace(/\s+/g, ' ').trim()
  if (!title) return 'New Task'
  return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

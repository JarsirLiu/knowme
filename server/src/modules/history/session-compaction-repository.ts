import type { AgentInputItem } from '@openai/agents'
import { prisma } from '../../db/client.js'
import {
  PrismaAgentSessionRepository,
  type AgentSessionRepository,
} from './agent-session-repository.js'
import type { SessionCompactionResult } from './compaction-policy.js'

export interface SessionCompactionRepository {
  readItems(sessionId: string): Promise<AgentInputItem[]>
  replaceItems(sessionId: string, items: AgentInputItem[]): Promise<void>
  readUsageBaseline(sessionId: string): Promise<{ inputTokens: number; estimatedTokens: number } | undefined>
  persistCompactionMessage(sessionId: string, result: SessionCompactionResult): Promise<unknown>
}

export class PrismaSessionCompactionRepository implements SessionCompactionRepository {
  constructor(
    private readonly sessionRepository: AgentSessionRepository = new PrismaAgentSessionRepository(),
  ) {}

  readItems(sessionId: string) {
    return this.sessionRepository.getItems(sessionId)
  }

  replaceItems(sessionId: string, items: AgentInputItem[]) {
    return this.sessionRepository.replaceItems(sessionId, items)
  }

  async readUsageBaseline(sessionId: string) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { conversationId: true },
    })
    if (!session) return undefined

    const event = await prisma.timelineEvent.findFirst({
      where: {
        type: 'run.usage',
        conversationId: session.conversationId,
      },
      orderBy: { createdAt: 'desc' },
    })
    const legacyEvent = event ?? await prisma.runEvent.findFirst({
      where: {
        type: 'run.usage',
        run: { conversationId: session.conversationId },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!legacyEvent) return undefined

    try {
      const payload = JSON.parse(legacyEvent.payload) as Record<string, unknown>
      const inputTokens = Number(payload.inputTokens)
      const estimatedTokens = Number(payload.estimatedTokens)
      if (!Number.isFinite(inputTokens) || !Number.isFinite(estimatedTokens)) return undefined
      return { inputTokens, estimatedTokens }
    } catch {
      return undefined
    }
  }

  async persistCompactionMessage(sessionId: string, result: SessionCompactionResult) {
    if (result.status !== 'compacted') return null

    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { conversationId: true },
    })
    if (!session) throw new Error(`Agent session not found: ${sessionId}`)

    const payload = {
      kind: 'context_compaction' as const,
      trigger: result.trigger,
      status: 'completed' as const,
      compactedItems: result.compactedItems,
      keptItems: result.keptItems,
      estimatedTokensBefore: result.estimatedTokensBefore,
      estimatedTokensAfter: result.estimatedTokensAfter,
      predictedInputTokens: result.predictedInputTokens,
      inputBudgetTokens: result.inputBudgetTokens,
      hardLimitTokens: result.hardLimitTokens,
      baseTokens: result.baseTokens,
      summary: result.summary,
    }

    return prisma.message.create({
      data: {
        conversationId: session.conversationId,
        role: 'system',
        content: JSON.stringify(payload),
      },
    })
  }
}

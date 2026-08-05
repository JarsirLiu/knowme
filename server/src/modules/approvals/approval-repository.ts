import type { Approval } from '@prisma/client'
import { prisma } from '../../db/client.js'

export interface ApprovalRepository {
  upsert(data: { runId: string; toolCallId: string; toolName: string; arguments: unknown }): Promise<void>
  resolve(conversationId: string, toolCallId: string, approved: boolean): Promise<boolean>
  listPending(runId: string): Promise<Approval[]>
  listForRun(runId: string): Promise<Approval[]>
}

export class PrismaApprovalRepository implements ApprovalRepository {
  async upsert(data: { runId: string; toolCallId: string; toolName: string; arguments: unknown }) {
    await prisma.approval.upsert({
      where: { toolCallId: data.toolCallId },
      create: {
        runId: data.runId,
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        arguments: JSON.stringify(data.arguments),
        status: 'pending',
      },
      update: {
        runId: data.runId,
        toolName: data.toolName,
        arguments: JSON.stringify(data.arguments),
        status: 'pending',
        decision: null,
        resolvedAt: null,
      },
    })
  }

  async resolve(conversationId: string, toolCallId: string, approved: boolean) {
    const approval = await prisma.approval.findFirst({
      where: { toolCallId, run: { conversationId }, status: 'pending' },
    })
    if (approval) {
      const updated = await prisma.approval.updateMany({
        where: { id: approval.id, status: 'pending' },
        data: {
          status: approved ? 'approved' : 'denied',
          decision: approved ? 'approve' : 'deny',
          resolvedAt: new Date(),
        },
      })
      if (updated.count === 1) return true
    }

    // Approval buttons can be submitted more than once while the SSE stream
    // is catching up. Resolving an already-resolved approval is idempotent.
    return Boolean(await prisma.approval.findFirst({
      where: { toolCallId, run: { conversationId }, status: { in: ['approved', 'denied'] } },
      select: { id: true },
    }))
  }

  listPending(runId: string) {
    return prisma.approval.findMany({ where: { runId, status: 'pending' }, orderBy: { createdAt: 'asc' } })
  }

  listForRun(runId: string) {
    return prisma.approval.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })
  }
}

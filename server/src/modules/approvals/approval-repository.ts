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
    if (!approval) return false
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: approved ? 'approved' : 'denied',
        decision: approved ? 'approve' : 'deny',
        resolvedAt: new Date(),
      },
    })
    return true
  }

  listPending(runId: string) {
    return prisma.approval.findMany({ where: { runId, status: 'pending' }, orderBy: { createdAt: 'asc' } })
  }

  listForRun(runId: string) {
    return prisma.approval.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })
  }
}

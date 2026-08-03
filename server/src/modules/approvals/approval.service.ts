import { prisma } from '../../db/client.js'

export class ApprovalService {
  async createApproval(data: {
    runId: string
    toolCallId: string
    toolName: string
    arguments: unknown
  }): Promise<void> {
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

  async approve(conversationId: string, toolCallId: string): Promise<boolean> {
    return this.resolve(conversationId, toolCallId, true)
  }

  async deny(conversationId: string, toolCallId: string): Promise<boolean> {
    return this.resolve(conversationId, toolCallId, false)
  }

  private async resolve(
    conversationId: string,
    toolCallId: string,
    approved: boolean,
  ): Promise<boolean> {
    const approval = await prisma.approval.findFirst({
      where: {
        toolCallId,
        run: { conversationId },
        status: 'pending',
      },
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

  async getPendingForRun(runId: string) {
    return prisma.approval.findMany({ where: { runId, status: 'pending' }, orderBy: { createdAt: 'asc' } })
  }

  async getForRun(runId: string) {
    return prisma.approval.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })
  }
}

import { prisma } from '../../db/client.js'

type PendingApproval = {
  runId: string
  resolve: (approved: boolean) => void
}

export class ApprovalService {
  private readonly pending = new Map<string, PendingApproval>()

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

  async waitForApproval(toolCallId: string, runId: string): Promise<boolean> {
    const existing = await prisma.approval.findUnique({ where: { toolCallId } })
    if (!existing || existing.runId !== runId) throw new Error(`Approval not found: ${toolCallId}`)
    if (existing.status === 'approved') return true
    if (existing.status === 'denied') return false

    return new Promise((resolve) => {
      this.pending.set(toolCallId, { runId, resolve })
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

    const waiter = this.pending.get(toolCallId)
    if (waiter) {
      waiter.resolve(approved)
      this.pending.delete(toolCallId)
    }
    return true
  }
}

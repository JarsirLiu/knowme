import { prisma } from '../db/client.js'

export class ToolApprovalService {
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>()

  async requestApproval(toolCallId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(toolCallId, { resolve })
    })
  }

  approve(toolCallId: string): boolean {
    const pending = this.pendingApprovals.get(toolCallId)
    if (!pending) return false
    pending.resolve(true)
    this.pendingApprovals.delete(toolCallId)
    return true
  }

  deny(toolCallId: string): boolean {
    const pending = this.pendingApprovals.get(toolCallId)
    if (!pending) return false
    pending.resolve(false)
    this.pendingApprovals.delete(toolCallId)
    return true
  }

  async saveToolCall(data: {
    id: string
    sessionId: string
    name: string
    args: unknown
    status: string
    result?: unknown
    error?: string
  }) {
    await prisma.toolCall.create({
      data: {
        id: data.id,
        sessionId: data.sessionId,
        name: data.name,
        args: JSON.stringify(data.args),
        status: data.status,
        result: data.result ? JSON.stringify(data.result) : null,
        error: data.error ?? null,
      },
    })
  }

  async updateToolCall(id: string, data: { status: string; result?: unknown; error?: string }) {
    await prisma.toolCall.update({
      where: { id },
      data: {
        status: data.status,
        result: data.result ? JSON.stringify(data.result) : undefined,
        error: data.error,
      },
    })
  }
}
import { PrismaApprovalRepository, type ApprovalRepository } from './approval-repository.js'

export class ApprovalService {
  constructor(private readonly repository: ApprovalRepository = new PrismaApprovalRepository()) {}

  createApproval(data: {
    runId: string
    toolCallId: string
    toolName: string
    arguments: unknown
  }) {
    return this.repository.upsert(data)
  }

  approve(conversationId: string, toolCallId: string) {
    return this.repository.resolve(conversationId, toolCallId, true)
  }

  deny(conversationId: string, toolCallId: string) {
    return this.repository.resolve(conversationId, toolCallId, false)
  }

  getPendingForRun(runId: string) {
    return this.repository.listPending(runId)
  }

  getForRun(runId: string) {
    return this.repository.listForRun(runId)
  }
}

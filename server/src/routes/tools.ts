import type { FastifyInstance } from 'fastify'
import type { ToolApprovalService } from '../services/tool-approval.js'

export function registerToolRoutes(app: FastifyInstance, approvalService: ToolApprovalService) {
  app.post('/api/conversations/:conversationId/approvals/:toolCallId/approve', async (req, reply) => {
    const { conversationId, toolCallId } = req.params as { conversationId: string; toolCallId: string }
    const ok = await approvalService.approve(conversationId, toolCallId)
    if (!ok) return reply.status(404).send({ error: 'Approval not found or already resolved' })
    return reply.send({ success: true })
  })

  app.post('/api/conversations/:conversationId/approvals/:toolCallId/deny', async (req, reply) => {
    const { conversationId, toolCallId } = req.params as { conversationId: string; toolCallId: string }
    const ok = await approvalService.deny(conversationId, toolCallId)
    if (!ok) return reply.status(404).send({ error: 'Approval not found or already resolved' })
    return reply.send({ success: true })
  })
}

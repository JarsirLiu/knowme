import type { FastifyInstance } from 'fastify'
import type { ApprovalService } from './approval.service.js'
import type { RunCoordinator } from '../runs/run-coordinator.js'

export function registerApprovalRoutes(app: FastifyInstance, approvalService: ApprovalService, coordinator: RunCoordinator) {
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

  app.post('/api/conversations/:conversationId/runs/:runId/cancel', async (req, reply) => {
    const { conversationId, runId } = req.params as { conversationId: string; runId: string }
    const run = await coordinator.cancelWithChildren(runId)
    if (!run) return reply.status(404).send({ error: 'Run not found or already finished' })
    return reply.send({ success: true, conversationId })
  })
}

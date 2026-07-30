import type { FastifyInstance } from 'fastify'
import type { ToolApprovalService } from '../services/tool-approval.js'

export function registerToolRoutes(app: FastifyInstance, approvalService: ToolApprovalService) {
  app.post('/api/sessions/:id/tools/approve', async (req, reply) => {
    const body = req.body as { toolCallId: string }
    const ok = approvalService.approve(body.toolCallId)
    if (!ok) return reply.status(404).send({ error: 'Tool call not found or already resolved' })
    return reply.send({ success: true })
  })

  app.post('/api/sessions/:id/tools/deny', async (req, reply) => {
    const body = req.body as { toolCallId: string }
    const ok = approvalService.deny(body.toolCallId)
    if (!ok) return reply.status(404).send({ error: 'Tool call not found or already resolved' })
    return reply.send({ success: true })
  })
}
import type { FastifyInstance } from 'fastify'
import type { SessionManager } from '../services/session-manager.js'

export function registerSessionRoutes(app: FastifyInstance, sessionManager: SessionManager) {
  app.post('/api/sessions', async (req, reply) => {
    const body = req.body as { name?: string } | undefined
    const session = await sessionManager.create(body?.name)
    return reply.send({ session })
  })

  app.get('/api/sessions', async (_req, reply) => {
    const sessions = await sessionManager.list()
    return reply.send({ sessions })
  })

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const session = await sessionManager.get(id)
    return reply.send({ session })
  })

  app.get('/api/sessions/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const messages = await sessionManager.getMessages(id)
    return reply.send({ messages })
  })
}
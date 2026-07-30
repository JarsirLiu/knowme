import type { FastifyInstance } from 'fastify'
import type { ChatService } from '../services/chat-service.js'

export function registerChatRoutes(app: FastifyInstance, chatService: ChatService) {
  app.post('/api/sessions/:id/chat', async (req, reply) => {
    reply.hijack()
    const { id } = req.params as { id: string }
    const body = req.body as { message: string }
    await chatService.handleChat(id, body.message, reply)
  })
}
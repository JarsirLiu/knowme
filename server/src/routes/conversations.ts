import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { ConversationService } from '../services/conversation-service.js'
import type { ChatService } from '../services/chat-service.js'

export function registerConversationRoutes(
  app: FastifyInstance,
  conversationService: ConversationService,
  chatService: ChatService,
) {
  app.get('/api/conversations/:conversationId/timeline', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string }
    const timeline = await conversationService.getTimeline(conversationId)
    return reply.send(timeline)
  })

  app.post('/api/conversations/:conversationId/turns', async (req, reply) => {
    reply.hijack()
    const { conversationId } = req.params as { conversationId: string }
    const body = req.body as { message?: string; clientMessageId?: string }
    await chatService.handleTurn(
      { conversationId },
      body?.message?.trim() ?? '',
      body?.clientMessageId ?? randomUUID(),
      reply,
    )
  })
}

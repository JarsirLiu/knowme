import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { TurnService } from '../chat/turn.service.js'
import type { ConversationService } from './conversation.service.js'

export function registerConversationRoutes(
  app: FastifyInstance,
  conversationService: ConversationService,
  turnService: TurnService,
) {
  app.get('/api/conversations/:conversationId/timeline', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string }
    const timeline = await conversationService.getTimeline(conversationId)
    return reply.send(timeline)
  })

  app.delete('/api/conversations/:conversationId', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string }
    await conversationService.delete(conversationId)
    return reply.status(204).send()
  })

  app.post('/api/conversations/:conversationId/context/compact', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string }
    const result = await conversationService.compactContext(conversationId)
    return reply.send(result)
  })

  app.post('/api/conversations/:conversationId/turns', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string }
    const body = req.body as { message?: string; clientMessageId?: string }
    return turnService.handleTurn(
      { conversationId },
      body?.message?.trim() ?? '',
      body?.clientMessageId ?? randomUUID(),
      reply,
    )
  })

  app.get('/api/conversations/:conversationId/events', async (req, reply) => {
    reply.hijack()
    const { conversationId } = req.params as { conversationId: string }
    const lastEventId = req.headers['last-event-id']
    await turnService.streamConversation(
      conversationId,
      Array.isArray(lastEventId) ? lastEventId[0] : lastEventId,
      reply,
    )
  })
}

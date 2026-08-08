import type { FastifyInstance } from 'fastify'
import type { TurnService } from '../chat/turn.service.js'
import type { ConversationService } from './conversation.service.js'
import { ConversationHasActiveRunError } from './conversation-errors.js'

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
    try {
      await conversationService.delete(conversationId)
    } catch (error) {
      if (error instanceof ConversationHasActiveRunError) {
        return reply.status(409).send({ code: error.code, error: 'Cannot archive a conversation with an active run' })
      }
      throw error
    }
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
      body?.clientMessageId,
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

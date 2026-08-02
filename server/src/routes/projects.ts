import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { ProjectService } from '../services/project-service.js'
import type { ConversationService } from '../services/conversation-service.js'
import type { ChatService } from '../services/chat-service.js'

export function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  conversationService: ConversationService,
  chatService: ChatService,
) {
  app.get('/api/projects', async (_req, reply) => {
    const projects = await projectService.list()
    return reply.send({ projects })
  })

  app.post('/api/projects', async (req, reply) => {
    const body = req.body as { name?: string; rootPath?: string }
    if (!body?.name?.trim() || !body.rootPath?.trim()) {
      return reply.status(400).send({ error: 'name and rootPath are required' })
    }
    const project = await projectService.create({ name: body.name, rootPath: body.rootPath })
    return reply.send({ project })
  })

  app.get('/api/projects/:projectId/conversations', async (req, reply) => {
    const { projectId } = req.params as { projectId: string }
    const conversations = await conversationService.list(projectId)
    return reply.send({ conversations })
  })

  app.post('/api/projects/:projectId/turns', async (req, reply) => {
    reply.hijack()
    const { projectId } = req.params as { projectId: string }
    const body = req.body as { message?: string; clientMessageId?: string }
    await chatService.handleTurn(
      { projectId },
      body?.message?.trim() ?? '',
      body?.clientMessageId ?? randomUUID(),
      reply,
    )
  })
}

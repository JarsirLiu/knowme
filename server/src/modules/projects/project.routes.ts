import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { TurnService } from '../chat/turn.service.js'
import type { ConversationService } from '../conversations/conversation.service.js'
import type { ProjectService } from './project.service.js'

export function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  conversationService: ConversationService,
  turnService: TurnService,
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
    await turnService.handleTurn(
      { projectId },
      body?.message?.trim() ?? '',
      body?.clientMessageId ?? randomUUID(),
      reply,
    )
  })
}

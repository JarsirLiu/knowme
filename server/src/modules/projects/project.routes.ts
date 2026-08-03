import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { TurnService } from '../chat/turn.service.js'
import type { ConversationService } from '../conversations/conversation.service.js'
import type { ProjectService } from './project.service.js'
import { DirectoryAccessError, type DirectoryService } from './directory.service.js'

export function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  directoryService: DirectoryService,
  conversationService: ConversationService,
  turnService: TurnService,
) {
  app.get('/api/directories', async (req, reply) => {
    const { path: requestedPath } = req.query as { path?: string }
    try {
      return reply.send(await directoryService.list(requestedPath))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof DirectoryAccessError) {
        const status = error.code === 'not_found' ? 404 : error.code === 'permission_denied' ? 403 : 400
        return reply.status(status).send({ code: error.code, error: message })
      }
      return reply.status(400).send({ code: 'invalid_path', error: `无法读取目录：${message}` })
    }
  })

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
    const { projectId } = req.params as { projectId: string }
    const body = req.body as { message?: string; clientMessageId?: string }
    return turnService.handleTurn(
      { projectId },
      body?.message?.trim() ?? '',
      body?.clientMessageId ?? randomUUID(),
      reply,
    )
  })
}

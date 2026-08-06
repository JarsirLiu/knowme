import type { FastifyInstance } from 'fastify'
import { DirectoryService, DirectoryAccessError } from './directory.service.js'

export function registerDirectoryRoutes(app: FastifyInstance, directoryService: DirectoryService) {
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
}
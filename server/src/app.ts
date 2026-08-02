import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './routes/index.js'
import type { ServerConfig } from './config.js'
import { ensureDatabase } from './db/ensure-database.js'

export function createApp(config: ServerConfig) {
  const app = Fastify({ logger: true })

  app.register(cors, { origin: true })

  app.addHook('onReady', async () => {
    await ensureDatabase()
  })

  registerRoutes(app)

  return app
}

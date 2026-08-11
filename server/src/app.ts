import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './modules/index.js'
import type { ServerConfig } from './config.js'
import { ensureDatabase } from './db/ensure-database.js'

export function createApp(config: ServerConfig) {
  const app = Fastify({
    logger: process.env.CLOUDAGENT_FASTIFY_LOGGER === 'false'
      ? false
      : {
          level: process.env.CLOUDAGENT_LOG_LEVEL ?? 'info',
          base: null,
        },
  })

  app.register(cors, { origin: true })

  app.addHook('onReady', async () => {
    await ensureDatabase()
  })

  registerRoutes(app)

  return app
}

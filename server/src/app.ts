import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './routes/index.js'

export function createApp() {
  const app = Fastify({ logger: true })

  app.register(cors, { origin: true })

  registerRoutes(app)

  return app
}
import { createApp } from './app.js'
import { loadServerConfig } from './config.js'
import { prisma } from './db/client.js'
import { logger } from './utils/logger.js'

async function main() {
  const cfg = loadServerConfig()
  const app = createApp(cfg)
  let shuttingDown = false

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`Received ${signal}, shutting down`)
    try {
      await app.close()
      await prisma.$disconnect()
    } catch (err) {
      logger.error('Failed to shut down cleanly:', err)
      process.exitCode = 1
    }
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
    logger.info(`Server running on http://localhost:${cfg.port}`)
  } catch (err) {
    logger.error('Failed to start server:', err)
    await prisma.$disconnect().catch(() => undefined)
    process.exitCode = 1
  }
}

main()

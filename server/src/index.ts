import { createApp } from './app.js'
import { loadServerConfig } from './config.js'
import { logger } from './utils/logger.js'

async function main() {
  const cfg = loadServerConfig()
  const app = createApp(cfg)

  try {
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
    logger.info(`Server running on http://localhost:${cfg.port}`)
  } catch (err) {
    logger.error('Failed to start server:', err)
    process.exit(1)
  }
}

main()

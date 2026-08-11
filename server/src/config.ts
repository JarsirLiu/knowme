import { config as loadDotenv } from 'dotenv'
import path from 'node:path'

loadDotenv({ path: path.resolve(process.cwd(), '..', '.env') })

export interface ServerConfig {
  port: number
}

export function loadServerConfig(): ServerConfig {
  const port = Number(process.env.CLOUDAGENT_PORT || '3801') || 3801
  return { port }
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.data')
fs.mkdirSync(dataDir, { recursive: true })

const datasourceUrl = process.env.SUPERAGENT_DATABASE_URL ?? process.env.DATABASE_URL

export const prisma = new PrismaClient(
  datasourceUrl
    ? {
        datasources: {
          db: { url: datasourceUrl },
        },
      }
    : undefined,
)

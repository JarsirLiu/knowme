import { PrismaClient } from '@prisma/client'

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

import { prisma } from './client.js'

// Prisma Client can still use SQLite when the Prisma CLI schema engine is not
// available (for example, on some Windows + Node combinations). Keep the
// bootstrap idempotent so a fresh personal install can start without a
// separate database service or migration process.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "settingsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Project_rootPath_key" ON "Project"("rootPath")`,
  `CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "agentProfile" TEXT NOT NULL DEFAULT 'coding',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Conversation_projectId_updatedAt_idx"
    ON "Conversation"("projectId", "updatedAt")`,
  `CREATE TABLE IF NOT EXISTS "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentSession_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentSession_conversationId_key"
    ON "AgentSession"("conversationId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentSession_sessionKey_key"
    ON "AgentSession"("sessionKey")`,
  `CREATE TABLE IF NOT EXISTS "SessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionItem_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SessionItem_sessionId_sequence_key"
    ON "SessionItem"("sessionId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "SessionItem_sessionId_sequence_idx"
    ON "SessionItem"("sessionId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" TEXT NOT NULL,
    "output" TEXT,
    "state" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRun_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_conversationId_createdAt_idx"
    ON "AgentRun"("conversationId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_conversationId_clientMessageId_idx"
    ON "AgentRun"("conversationId", "clientMessageId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentRun_clientMessageId_key"
    ON "AgentRun"("clientMessageId")`,
  `CREATE TABLE IF NOT EXISTS "RunEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunEvent_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RunEvent_runId_sequence_key"
    ON "RunEvent"("runId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "RunEvent_runId_sequence_idx"
    ON "RunEvent"("runId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Approval_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Approval_toolCallId_key" ON "Approval"("toolCallId")`,
  `CREATE TABLE IF NOT EXISTS "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "sha256" TEXT,
    "localPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artifact_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "runId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx"
    ON "Message"("conversationId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
] as const

let initialized: Promise<void> | undefined

export function ensureDatabase(): Promise<void> {
  initialized ??= initializeDatabase()
  return initialized
}

async function initializeDatabase() {
  await prisma.$connect()
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')

  for (const statement of TABLES) {
    await prisma.$executeRawUnsafe(statement)
  }
}

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
    "parentConversationId" TEXT,
    "parentRunId" TEXT,
    "parentToolCallId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunSequence" INTEGER NOT NULL DEFAULT 0,
    "activeRunId" TEXT,
    CONSTRAINT "Conversation_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_parentConversationId_fkey"
      FOREIGN KEY ("parentConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Conversation_projectId_updatedAt_idx"
    ON "Conversation"("projectId", "updatedAt")`,
  `CREATE TABLE IF NOT EXISTS "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
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
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" TEXT NOT NULL,
    "output" TEXT,
    "state" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "lastHeartbeatAt" DATETIME,
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
  `CREATE INDEX IF NOT EXISTS "AgentRun_status_createdAt_idx"
    ON "AgentRun"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_leaseExpiresAt_idx"
    ON "AgentRun"("leaseExpiresAt")`,
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
  `CREATE TABLE IF NOT EXISTS "TimelineSequence" (
    "conversationId" TEXT NOT NULL PRIMARY KEY,
    "nextSequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TimelineSequence_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "runId" TEXT,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimelineEvent_conversationId_sequence_key"
    ON "TimelineEvent"("conversationId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "TimelineEvent_conversationId_sequence_idx"
    ON "TimelineEvent"("conversationId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "TimelineEvent_runId_sequence_idx"
    ON "TimelineEvent"("runId", "sequence")`,
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
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL')
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')

  for (const statement of TABLES) {
    await prisma.$executeRawUnsafe(statement)
  }

  await addColumnIfMissing('AgentRun', 'attempt', 'INTEGER NOT NULL DEFAULT 0')
  await addColumnIfMissing('AgentRun', 'leaseOwner', 'TEXT')
  await addColumnIfMissing('AgentRun', 'leaseExpiresAt', 'DATETIME')
  await addColumnIfMissing('AgentRun', 'cancelRequestedAt', 'DATETIME')
  await addColumnIfMissing('AgentRun', 'lastHeartbeatAt', 'DATETIME')
  await addColumnIfMissing('Conversation', 'nextRunSequence', 'INTEGER NOT NULL DEFAULT 0')
  await addColumnIfMissing('Conversation', 'activeRunId', 'TEXT')
  await addColumnIfMissing('Conversation', 'parentConversationId', 'TEXT')
  await addColumnIfMissing('Conversation', 'parentRunId', 'TEXT')
  await addColumnIfMissing('Conversation', 'parentToolCallId', 'TEXT')
  await addColumnIfMissing('AgentRun', 'sequence', 'INTEGER NOT NULL DEFAULT 0')
  await addColumnIfMissing('AgentSession', 'status', 'TEXT NOT NULL DEFAULT \'active\'')
  await addColumnIfMissing('AgentSession', 'lastActivityAt', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP')
  await addColumnIfMissing('AgentSession', 'archivedAt', 'DATETIME')
  const duplicateClaims = await prisma.$queryRawUnsafe<Array<{ activeRunId: string; count: bigint }>>(
    'SELECT "activeRunId", COUNT(*) AS "count" FROM "Conversation" WHERE "activeRunId" IS NOT NULL GROUP BY "activeRunId" HAVING COUNT(*) > 1',
  )
  for (const duplicate of duplicateClaims) {
    const conversations = await prisma.conversation.findMany({
      where: { activeRunId: duplicate.activeRunId },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    })
    await prisma.conversation.updateMany({
      where: { id: { in: conversations.slice(1).map((conversation) => conversation.id) } },
      data: { activeRunId: null },
    })
  }
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_activeRunId_key" ON "Conversation"("activeRunId")')
}

const EXPRESSION_DEFAULTS = ['CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME']

async function addColumnIfMissing(table: string, column: string, definition: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`)
  if (rows.some((row) => row.name === column)) return
  const expressionDefault = EXPRESSION_DEFAULTS.find((d) =>
    definition.includes(`DEFAULT ${d}`),
  )
  if (expressionDefault) {
    const stripped = definition.replace(/\s+NOT NULL DEFAULT\s+\S+/i, '').replace(/\s+DEFAULT\s+\S+/i, '')
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${stripped}`)
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = ${expressionDefault} WHERE "${column}" IS NULL`)
  } else {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`)
  }
}

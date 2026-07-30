import fs from 'node:fs'
import path from 'node:path'
import { tool } from '@openai/agents'
import { z } from 'zod'
import { resolveSafe } from './utils.js'

export const readFile = (workspace: string) =>
  tool({
    name: 'read_file',
    description: 'Read file content with line numbers. Use offset/limit for large files.',
    parameters: z.object({
      path: z.string().describe('Relative file path'),
      offset: z.coerce.number().int().min(1).nullable().optional().describe('Start line (1-based)'),
      limit: z.coerce.number().int().min(1).nullable().optional().describe('Max lines to read, default 500'),
    }),
    execute: async ({ path: p, offset, limit }) => {
      const abs = resolveSafe(workspace, p)
      const content = fs.readFileSync(abs, 'utf8')
      const lines = content.split(/\r?\n/)
      const start = (offset ?? 1) - 1
      const n = limit ?? 500
      const slice = lines.slice(start, start + n)
      const numbered = slice
        .map((l, i) => `${start + i + 1}→${l}`)
        .join('\n')
      const more =
        start + n < lines.length ? `\n... (${lines.length} total, truncated)` : ''
      return numbered + more
    },
  })
import fs from 'node:fs'
import path from 'node:path'
import { tool } from '@openai/agents'
import { z } from 'zod'
import { resolveSafe } from './utils.js'

export const listDir = (workspace: string) =>
  tool({
    name: 'list_dir',
    description: 'List files and directories in a subdirectory. "." for root.',
    parameters: z.object({
      path: z.string().describe('Relative path, e.g. "." or "src"'),
    }),
    execute: async ({ path: p }) => {
      const abs = resolveSafe(workspace, p)
      const entries = fs.readdirSync(abs, { withFileTypes: true })
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      return lines.length ? lines.join('\n') : '(empty directory)'
    },
  })
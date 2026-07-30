import fs from 'node:fs'
import path from 'node:path'
import { tool } from '@openai/agents'
import { z } from 'zod'
import { resolveSafe } from './utils.js'

export const writeFile = (workspace: string) =>
  tool({
    name: 'write_file',
    description: 'Create or overwrite a file (auto-creates parent directories).',
    parameters: z.object({
      path: z.string().describe('Relative file path'),
      content: z.string().describe('Full file content'),
    }),
    execute: async ({ path: p, content }) => {
      const abs = resolveSafe(workspace, p)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content, 'utf8')
      return `Written ${p} (${content.length} chars)`
    },
  })
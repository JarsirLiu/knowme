import fs from 'node:fs'
import { tool } from '@openai/agents'
import { z } from 'zod'
import { resolveSafe } from './utils.js'

export const editFile = (workspace: string) =>
  tool({
    name: 'edit_file',
    description:
      'Precise string replacement in a file. old_string must be unique unless replace_all is true.',
    parameters: z.object({
      path: z.string(),
      old_string: z.string().describe('Text to replace, must match file content exactly'),
      new_string: z.string().describe('Replacement text'),
      replace_all: z.boolean().nullable().optional().describe('Replace all occurrences, default false'),
    }),
    execute: async ({ path: p, old_string, new_string, replace_all }) => {
      const abs = resolveSafe(workspace, p)
      const content = fs.readFileSync(abs, 'utf8')
      const count = content.split(old_string).length - 1
      if (count === 0) throw new Error(`old_string not found in ${p}`)
      if (count > 1 && !replace_all) {
        throw new Error(
          `old_string appears ${count} times in ${p}. Provide more context or set replace_all.`,
        )
      }
      const next = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string)
      fs.writeFileSync(abs, next, 'utf8')
      return `Modified ${p} (${replace_all ? count : 1} replacement(s))`
    },
  })
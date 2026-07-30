import fs from 'node:fs'
import path from 'node:path'
import { tool } from '@openai/agents'
import { z } from 'zod'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv',
])

function walk(dir: string, workspace: string, files: string[], globRe: RegExp | null): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue
      walk(path.join(dir, e.name), workspace, files, globRe)
    } else if (e.isFile()) {
      const abs = path.join(dir, e.name)
      const rel = path.relative(workspace, abs).replace(/\\/g, '/')
      if (!globRe || globRe.test(rel)) files.push(rel)
    }
  }
}

function globToRegex(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${esc}$`, 'i')
}

export const grep = (workspace: string) =>
  tool({
    name: 'grep',
    description:
      'Search file contents by regex across the workspace. Optionally filter by glob.',
    parameters: z.object({
      pattern: z.string().describe('JavaScript regex pattern'),
      glob: z.string().nullable().optional().describe('Optional file glob filter, e.g. "**/*.js"'),
    }),
    execute: async ({ pattern, glob }) => {
      const re = new RegExp(pattern)
      const files: string[] = []
      walk(workspace, workspace, files, glob ? globToRegex(glob) : null)
      const hits: string[] = []
      for (const rel of files) {
        if (hits.length >= 100) break
        let content: string
        try {
          content = fs.readFileSync(path.join(workspace, rel), 'utf8')
        } catch {
          continue
        }
        if (content.includes('\u0000')) continue
        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length && hits.length < 100; i++) {
          if (re.test(lines[i]))
            hits.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 200)}`)
        }
      }
      return hits.length ? hits.join('\n') : '(no matches)'
    },
  })
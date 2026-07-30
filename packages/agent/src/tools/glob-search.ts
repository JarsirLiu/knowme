import fs from 'node:fs'
import path from 'node:path'
import { tool } from '@openai/agents'
import { z } from 'zod'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv',
])

function walk(
  dir: string,
  workspace: string,
  results: string[],
  opts: { limit: number; pattern: RegExp | null },
): void {
  if (results.length >= opts.limit) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (results.length >= opts.limit) return
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue
      walk(path.join(dir, e.name), workspace, results, opts)
    } else if (e.isFile()) {
      const abs = path.join(dir, e.name)
      const rel = path.relative(workspace, abs).replace(/\\/g, '/')
      if (!opts.pattern || opts.pattern.test(rel)) results.push(rel)
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

export const globTool = (workspace: string) =>
  tool({
    name: 'glob',
    description:
      'Find files by glob pattern, e.g. "src/**/*.ts", "*.json". Ignores node_modules/.git etc.',
    parameters: z.object({ pattern: z.string() }),
    execute: async ({ pattern }) => {
      const results: string[] = []
      walk(workspace, workspace, results, { limit: 200, pattern: globToRegex(pattern) })
      return results.length ? results.join('\n') : '(no matches)'
    },
  })
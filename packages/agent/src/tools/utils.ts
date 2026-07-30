import path from 'node:path'

export function resolveSafe(workspace: string, p: string): string {
  const abs = path.resolve(workspace, p)
  const rel = path.relative(workspace, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal denied: ${p} is outside workspace ${workspace}`)
  }
  return abs
}
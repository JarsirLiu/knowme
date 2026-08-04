import fs from 'node:fs'
import path from 'node:path'

export function resolveSafe(workspace: string, p: string): string {
  const workspaceAbs = path.resolve(workspace)
  const abs = path.resolve(workspaceAbs, p)
  if (!isWithin(workspaceAbs, abs)) {
    throw new Error(`Path traversal denied: ${p} is outside workspace ${workspace}`)
  }

  const workspaceReal = fs.realpathSync.native(workspaceAbs)
  let current = workspaceAbs
  const relative = path.relative(workspaceAbs, abs)
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment)
    try {
      fs.lstatSync(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
      throw error
    }

    const currentReal = fs.realpathSync.native(current)
    if (!isWithin(workspaceReal, currentReal)) {
      throw new Error(`Path traversal denied: ${p} is outside workspace ${workspace}`)
    }
  }

  return abs
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

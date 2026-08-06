import fs from 'node:fs'
import path from 'node:path'
import type { Editor, ApplyPatchOperation, ApplyPatchResult, EditorInvocationContext } from '@openai/agents'
import { applyDiff } from '@openai/agents-core'

function resolveSafe(workspace: string, p: string): string {
  const abs = path.resolve(workspace, p)
  const relative = path.relative(workspace, abs)
  if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    const real = fs.realpathSync.native(workspace)
    let current = workspace
    for (const seg of relative ? relative.split(path.sep) : []) {
      current = path.join(current, seg)
      if (fs.existsSync(current)) {
        const curReal = fs.realpathSync.native(current)
        if (!curReal.startsWith(real + path.sep) && curReal !== real) {
          throw new Error(`Path traversal denied: ${p} is outside workspace ${workspace}`)
        }
      }
    }
    return abs
  }
  throw new Error(`Path traversal denied: ${p} is outside workspace ${workspace}`)
}

export class LocalEditor implements Editor {
  private readonly workspace: string

  constructor(workspace: string) {
    this.workspace = workspace
  }

  async createFile(
    operation: Extract<ApplyPatchOperation, { type: 'create_file' }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult | void> {
    const abs = resolveSafe(this.workspace, operation.path)
    if (fs.existsSync(abs)) {
      return { status: 'failed', output: `File already exists: ${operation.path}` }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, operation.diff ?? '', 'utf8')
    return { status: 'completed', output: `Created ${operation.path}` }
  }

  async updateFile(
    operation: Extract<ApplyPatchOperation, { type: 'update_file' }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult | void> {
    const abs = resolveSafe(this.workspace, operation.path)
    if (!fs.existsSync(abs)) {
      return { status: 'failed', output: `File not found: ${operation.path}` }
    }
    if (operation.moveTo) {
      const dest = resolveSafe(this.workspace, operation.moveTo)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.renameSync(abs, dest)
    }
    if (operation.diff) {
      const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
      try {
        const patched = applyDiff(content, operation.diff)
        fs.writeFileSync(abs, patched, 'utf8')
      } catch (err) {
        return { status: 'failed', output: `Patch failed: ${(err as Error).message}` }
      }
    }
    return { status: 'completed', output: `Updated ${operation.path}` }
  }

  async deleteFile(
    operation: Extract<ApplyPatchOperation, { type: 'delete_file' }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult | void> {
    const abs = resolveSafe(this.workspace, operation.path)
    if (!fs.existsSync(abs)) {
      return { status: 'failed', output: `File not found: ${operation.path}` }
    }
    fs.rmSync(abs, { recursive: true })
    return { status: 'completed', output: `Deleted ${operation.path}` }
  }
}
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DirectoryListing } from '@superagent/core'

export type DirectoryErrorCode = 'not_found' | 'permission_denied' | 'invalid_path'

export class DirectoryAccessError extends Error {
  constructor(
    message: string,
    public readonly code: DirectoryErrorCode,
  ) {
    super(message)
    this.name = 'DirectoryAccessError'
  }
}

export class DirectoryService {
  async list(inputPath?: string): Promise<DirectoryListing> {
    const currentPath = path.resolve(inputPath?.trim() || os.homedir())
    let entries
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      throw toDirectoryAccessError(currentPath, error)
    }
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))

    const root = path.parse(currentPath).root
    return {
      currentPath,
      parentPath: currentPath === root ? null : path.dirname(currentPath),
      rootPaths: await this.listRoots(currentPath),
      entries: directories,
    }
  }

  private async listRoots(currentPath: string) {
    const currentRoot = path.parse(currentPath).root
    if (process.platform !== 'win32') return [currentRoot]

    const candidates = Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:\\`)
    const available = await Promise.all(
      candidates.map(async (root) => {
        try {
          return (await fs.stat(root)).isDirectory() ? root : null
        } catch {
          return null
        }
      }),
    )
    const roots = available.filter((root): root is string => root !== null)
    if (!roots.includes(currentRoot)) roots.push(currentRoot)
    return roots
  }
}

function toDirectoryAccessError(currentPath: string, error: unknown): DirectoryAccessError {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: string }).code
    : undefined
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new DirectoryAccessError(`目录不存在：${currentPath}`, 'not_found')
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new DirectoryAccessError(`没有权限读取目录：${currentPath}`, 'permission_denied')
  }
  return new DirectoryAccessError(`目录路径无效：${currentPath}`, 'invalid_path')
}

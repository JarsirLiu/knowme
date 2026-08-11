import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DirectoryListing } from '@cloudagent/core'
import type { PlatformStrategy } from './platforms/types.js'
import { DirectoryAccessError, toDirectoryAccessError } from './directory.errors.js'

export { DirectoryAccessError } from './directory.errors.js'

export class DirectoryService {
  constructor(private readonly platform: PlatformStrategy) {}

  async list(inputPath?: string): Promise<DirectoryListing> {
    const currentPath = path.resolve(inputPath?.trim() || this.platform.getHomeDir())
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
      rootPaths: await this.platform.listRoots(),
      entries: directories,
    }
  }
}
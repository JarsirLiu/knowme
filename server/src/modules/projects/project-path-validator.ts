import fs from 'node:fs'
import path from 'node:path'

export class ProjectPathValidator {
  resolveDirectory(inputPath: string): string {
    const rootPath = path.resolve(inputPath)
    const stat = fs.statSync(rootPath, { throwIfNoEntry: false })
    if (!stat?.isDirectory()) {
      throw new Error(`Project root does not exist or is not a directory: ${rootPath}`)
    }
    return rootPath
  }
}

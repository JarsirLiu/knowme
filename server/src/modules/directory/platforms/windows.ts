import { promises as fs } from 'node:fs'
import type { PlatformStrategy } from './types.js'

export class WindowsPlatform implements PlatformStrategy {
  async listRoots(): Promise<string[]> {
    const candidates = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`)
    const available = await Promise.all(
      candidates.map(async (root) => {
        try {
          return (await fs.stat(root)).isDirectory() ? root : null
        } catch {
          return null
        }
      }),
    )
    return available.filter((r): r is string => r !== null)
  }

  getHomeDir(): string {
    return process.env.USERPROFILE || `${process.env.HOMEDRIVE || 'C:'}${process.env.HOMEPATH || '\\'}`
  }
}
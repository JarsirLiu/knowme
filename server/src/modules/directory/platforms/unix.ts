import os from 'node:os'
import type { PlatformStrategy } from './types.js'

export class UnixPlatform implements PlatformStrategy {
  async listRoots(): Promise<string[]> {
    return ['/']
  }

  getHomeDir(): string {
    return os.homedir()
  }
}
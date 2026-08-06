export interface PlatformStrategy {
  listRoots(): Promise<string[]>
  getHomeDir(): string
}
export interface DirectoryEntry {
  name: string
  path: string
}

export interface DirectoryListing {
  currentPath: string
  parentPath: string | null
  rootPaths: string[]
  entries: DirectoryEntry[]
}

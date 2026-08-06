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

export function toDirectoryAccessError(currentPath: string, error: unknown): DirectoryAccessError {
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
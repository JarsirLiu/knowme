import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Folder, HardDrive, Home, LoaderCircle, X } from 'lucide-react'
import type { DirectoryListing } from '@superagent/core'
import { client } from '@/api/client'
import styles from './DirectoryPickerModal.module.css'

type DirectoryPickerModalProps = {
  open: boolean
  onClose: () => void
  onSelect: (directory: string) => void
}

function getBreadcrumbItems(currentPath: string): Array<{ label: string; path: string }> {
  const parts = currentPath.split(/[/\\]/).filter(Boolean)
  if (parts.length === 0) return []

  const isWindows = parts[0].endsWith(':')
  const sep = isWindows ? '\\' : '/'
  const items: Array<{ label: string; path: string }> = []

  if (isWindows) {
    items.push({ label: parts[0], path: parts[0] + sep })
  } else {
    items.push({ label: '根目录', path: sep })
  }

  let built = parts[0].includes(':') ? parts[0] : ''
  for (let i = 1; i < parts.length; i++) {
    built += sep + parts[i]
    items.push({ label: parts[i], path: built })
  }

  return items
}

export function DirectoryPickerModal({ open, onClose, onSelect }: DirectoryPickerModalProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async (directory?: string) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const next = await client.listDirectories(directory)
      if (currentRequest !== requestId.current) return
      setListing(next)
      setSelectedPath(next.currentPath)
    } catch (reason) {
      if (currentRequest !== requestId.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [load, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const breadcrumbItems = useMemo(
    () => listing ? getBreadcrumbItems(listing.currentPath) : [],
    [listing]
  )

  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="directory-picker-title">
        <header className={styles.header}>
          <h2 id="directory-picker-title">选择项目文件夹</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.navBar}>
          <button
            className={styles.navButton}
            type="button"
            onClick={() => void load(listing?.parentPath ?? undefined)}
            disabled={!listing?.parentPath || loading}
            aria-label="返回上一级"
            title="返回上一级"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <div className={styles.breadcrumb}>
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1
              return (
                <span className={styles.breadcrumbGroup} key={item.path}>
                  {index > 0 && <ChevronRight className={styles.breadcrumbSeparator} size={12} />}
                  {isLast ? (
                    <span className={styles.breadcrumbLabel}>{item.label}</span>
                  ) : (
                    <button
                      className={styles.breadcrumbLink}
                      type="button"
                      onClick={() => void load(item.path)}
                      disabled={loading}
                    >
                      {item.label}
                    </button>
                  )}
                </span>
              )
            })}
            {!listing && loading && <span className={styles.breadcrumbLabel}>正在读取…</span>}
          </div>
          <button
            className={styles.navButton}
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="主目录"
            title="主目录"
          >
            <Home size={14} aria-hidden="true" />
          </button>
        </div>

        {listing && listing.rootPaths.length > 0 && (
          <div className={styles.driveBar}>
            <div className={styles.driveBarLabel}>
              <HardDrive size={12} aria-hidden="true" />
              <span>此电脑</span>
            </div>
            <div className={styles.driveTiles}>
              {listing.rootPaths.map((root) => {
                const active = listing.currentPath.toLowerCase().startsWith(root.toLowerCase())
                return (
                  <button
                    className={`${styles.driveTile} ${active ? styles.driveTileActive : ''}`}
                    key={root}
                    type="button"
                    onClick={() => void load(root)}
                    disabled={loading}
                  >
                    <HardDrive size={13} aria-hidden="true" />
                    <span className={styles.driveLabel}>{root}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className={styles.list} aria-live="polite" aria-busy={loading}>
          {!listing && loading && (
            <div className={styles.state}>
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
              <span>正在读取文件夹…</span>
            </div>
          )}
          {!loading && error && <div className={styles.stateError}>{error}</div>}
          {!loading && !error && listing?.entries.length === 0 && <div className={styles.state}>没有子文件夹</div>}
          {!error && listing?.entries.map((entry) => (
            <button
              className={`${styles.entry} ${selectedPath === entry.path ? styles.entrySelected : ''}`}
              key={entry.path}
              type="button"
              disabled={loading}
              onClick={() => setSelectedPath(entry.path)}
              onDoubleClick={() => void load(entry.path)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void load(entry.path)
              }}
              title="单击选中，双击进入"
            >
              <Folder size={16} aria-hidden="true" />
              <span>{entry.name}</span>
            </button>
          ))}
          {loading && listing && (
            <div className={styles.loadingOverlay} role="status" aria-label="正在读取文件夹">
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelButton} type="button" onClick={onClose}>取消</button>
          <button
            className={styles.selectButton}
            type="button"
            disabled={!listing || loading || Boolean(error)}
            onClick={() => onSelect(selectedPath ?? listing?.currentPath ?? '')}
          >
            <Check size={14} aria-hidden="true" />
            <span>选择此文件夹</span>
          </button>
        </footer>
      </section>
    </div>
  )
}

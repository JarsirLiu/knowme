import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Folder, HardDrive, Home, LoaderCircle, X } from 'lucide-react'
import type { DirectoryListing } from '@cloudagent/core'
import { client } from '@/api/client'
import styles from './DirectoryPickerModal.module.css'

type DirectoryPickerModalProps = {
  open: boolean
  onClose: () => void
  onSelect: (directory: string) => void
}

export function DirectoryPickerModal({ open, onClose, onSelect }: DirectoryPickerModalProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  const load = useCallback(async (directory?: string) => {
    setEditingPath(false)
    setEditValue('')
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

  const commitPath = useCallback(() => {
    if (editValue.trim()) {
      void load(editValue.trim())
    } else {
      setEditingPath(false)
    }
  }, [editValue, load])

  useEffect(() => {
    if (editingPath && editRef.current) {
      editRef.current.select()
    }
  }, [editingPath])

  useEffect(() => {
    if (!open) return
    void load()
  }, [load, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingPath) {
          setEditingPath(false)
          setEditValue('')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open, editingPath])

  const currentPath = listing?.currentPath ?? ''

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
          <button className={styles.navButton} type="button" onClick={() => void load()} disabled={loading} aria-label="主目录" title="主目录">
            <Home size={14} aria-hidden="true" />
          </button>
          {editingPath ? (
            <input
              ref={editRef}
              className={styles.pathInput}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPath()
              }}
              onBlur={commitPath}
              aria-label="编辑路径"
            />
          ) : (
            <span
              className={styles.fullPath}
              onClick={() => { setEditingPath(true); setEditValue(currentPath) }}
              title="点击编辑路径"
            >
              {currentPath || '正在读取…'}
            </span>
          )}
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

import { useEffect, useRef, useState } from 'react'
import styles from './ProjectModal.module.css'

type ProjectModalProps = {
  open: boolean
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (data: { name: string; rootPath: string }) => void
}

export function ProjectModal({ open, isSubmitting = false, onClose, onSubmit }: ProjectModalProps) {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setRootPath('')
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const canSubmit = name.trim().length > 0 && rootPath.trim().length > 0 && !isSubmitting

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit) onSubmit({ name: name.trim(), rootPath: rootPath.trim() })
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <form className={styles.modal} onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <div className={styles.modalHeader}>
          <h2 id="project-modal-title">创建项目</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <label className={styles.nameField}>
          <span className={styles.folderIcon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
            </svg>
          </span>
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称" aria-label="项目名称" />
        </label>

        <label className={styles.pathLabel}>
          <span>源文件夹</span>
          <span className={styles.pathField}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
            </svg>
            <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="输入本地文件夹的绝对路径" aria-label="源文件夹路径" />
          </span>
        </label>

        <div className={styles.actions}>
          <button className={styles.cancelButton} type="button" onClick={onClose}>取消</button>
          <button className={styles.submitButton} type="submit" disabled={!canSubmit}>{isSubmitting ? '创建中…' : '创建项目'}</button>
        </div>
      </form>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Folder, FolderPlus, X } from 'lucide-react'
import styles from './ProjectModal.module.css'

type ProjectModalProps = {
  open: boolean
  isSubmitting?: boolean
  selectedDirectory?: string | null
  onClose: () => void
  onSelectDirectory: () => void
  onSubmit: (data: { name: string; rootPath: string }) => void
}

export function ProjectModal({
  open,
  isSubmitting = false,
  selectedDirectory = null,
  onClose,
  onSelectDirectory,
  onSubmit,
}: ProjectModalProps) {
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
    if (selectedDirectory) setRootPath(selectedDirectory)
  }, [selectedDirectory])

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

  const handleSelectDirectory = () => {
    if (isSubmitting) return
    onSelectDirectory()
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <form className={styles.modal} onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <div className={styles.modalHeader}>
          <h2 id="project-modal-title">创建项目</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <label className={styles.nameField}>
          <span className={styles.folderIcon} aria-hidden="true">
            <Folder size={18} strokeWidth={1.8} />
          </span>
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称" aria-label="项目名称" />
        </label>

        <div className={styles.sourceSection}>
          <span className={styles.sourceLabel}>Source folders</span>
          <button
            className={styles.sourcePicker}
            type="button"
            onClick={() => void handleSelectDirectory()}
            disabled={isSubmitting}
            title={rootPath || undefined}
            aria-label="选择源文件夹"
          >
            <FolderPlus size={24} strokeWidth={1.8} />
            <span>{rootPath || '添加 ChatGPT 可读取和编辑的文件夹'}</span>
          </button>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelButton} type="button" onClick={onClose}>取消</button>
          <button className={styles.submitButton} type="submit" disabled={!canSubmit}>{isSubmitting ? '创建中…' : '创建项目'}</button>
        </div>
      </form>
    </div>
  )
}

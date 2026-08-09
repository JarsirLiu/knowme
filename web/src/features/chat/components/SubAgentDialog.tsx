import { useEffect } from 'react'
import type { ToolCall } from '../types'
import { SubAgentSession } from './SubAgentSession'
import styles from './SubAgentDialog.module.css'

interface SubAgentDialogProps {
  toolCall: ToolCall
  open: boolean
  onClose: () => void
}

export function SubAgentDialog({ toolCall, open, onClose }: SubAgentDialogProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="子agent 会话">
        <div className={styles.modalHeader}>
          <h2 className={styles.title}>子agent 会话</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          <SubAgentSession toolCall={toolCall} />
        </div>
      </section>
    </div>
  )
}
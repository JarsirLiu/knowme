import { useNavigate, useParams } from 'react-router-dom'
import type { ToolCall } from '../types'
import { Orb } from './Orb'
import styles from './SubAgentCard.module.css'

export function SubAgentCard({ toolCall }: { toolCall: ToolCall }) {
  const navigate = useNavigate()
  const { conversationId: parentConversationId } = useParams()
  const { name, status, childConversationId } = toolCall

  const args = typeof toolCall.args === 'object' && toolCall.args !== null
    ? (toolCall.args as Record<string, unknown>)
    : {}
  const subagentType = typeof args.subagentType === 'string' ? args.subagentType : ''
  const description = typeof args.description === 'string' ? args.description : ''

  const isRunning = status === 'running'
  const isCompleted = status === 'completed'
  const isError = status === 'failed' || status === 'incomplete' || status === 'denied'

  const handleClick = () => {
    if (childConversationId) {
      navigate(`/chat/${childConversationId}`, { state: { parentId: parentConversationId } })
    }
  }

  const canNavigate = !!childConversationId

  return (
    <div
      className={`${styles.sac} ${isCompleted ? styles.sacDone : ''} ${isError ? styles.sacError : ''} ${isRunning ? styles.sacRunning : ''} ${canNavigate ? styles.sacNavigable : ''}`}
      onClick={canNavigate ? handleClick : undefined}
      title={canNavigate ? '进入子会话' : undefined}
      role={canNavigate ? 'button' : undefined}
      tabIndex={canNavigate ? 0 : undefined}
    >
      <span className={styles.sacIcon} aria-hidden="true">
        {isRunning
          ? <Orb size={16} variant="S4" />
          : (
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <rect x="0" y="0" width="4" height="4" rx="1" />
              <rect x="6" y="0" width="4" height="4" rx="1" />
              <rect x="12" y="0" width="4" height="4" rx="1" />
              <rect x="0" y="6" width="4" height="4" rx="1" />
              <rect x="6" y="6" width="4" height="4" rx="1" />
              <rect x="12" y="6" width="4" height="4" rx="1" />
              <rect x="0" y="12" width="4" height="4" rx="1" />
              <rect x="6" y="12" width="4" height="4" rx="1" />
              <rect x="12" y="12" width="4" height="4" rx="1" />
            </svg>
          )}
      </span>
      <span className={styles.sacLabel}>
        {subagentType && <span className={styles.sacType}>{subagentType}</span>}
        {isRunning
          ? <span className={styles.sacShimmer}>{description || name}</span>
          : <span className={styles.sacName}>{description || name}</span>}
      </span>
      <span className={styles.sacStatus} aria-hidden="true">
        {isCompleted && <span className={styles.sacDot} data-status="completed" />}
        {isError && <span className={styles.sacDot} data-status="error" />}
      </span>
      {canNavigate && (
        <span className={styles.sacNav} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </span>
      )}
    </div>
  )
}

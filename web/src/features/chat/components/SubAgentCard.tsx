import { useNavigate } from 'react-router-dom'
import type { ToolCall } from '../types'
import styles from './SubAgentCard.module.css'

export function SubAgentCard({ toolCall }: { toolCall: ToolCall }) {
  const navigate = useNavigate()
  const { name, status, childConversationId } = toolCall

  const args = typeof toolCall.args === 'object' && toolCall.args !== null
    ? (toolCall.args as Record<string, unknown>)
    : {}
  const description = typeof args.description === 'string' ? args.description : ''
  const subagentType = typeof args.subagentType === 'string' ? args.subagentType : ''

  const isRunning = status === 'running'
  const isCompleted = status === 'completed'
  const isError = status === 'failed' || status === 'incomplete' || status === 'denied'

  const handleClick = () => {
    if (childConversationId) {
      navigate(`/chat/${childConversationId}`)
    }
  }

  return (
    <div
      className={`${styles.sac} ${isCompleted ? styles.sacDone : ''} ${isError ? styles.sacError : ''} ${isRunning ? styles.sacRunning : ''}`}
      onClick={childConversationId ? handleClick : undefined}
      title={childConversationId ? '进入子会话' : undefined}
      role={childConversationId ? 'button' : undefined}
      tabIndex={childConversationId ? 0 : undefined}
    >
      <span className={styles.sacIcon}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3" />
          <circle cx="6" cy="16" r="2.5" />
          <circle cx="18" cy="16" r="2.5" />
          <line x1="12" y1="11" x2="12" y2="14" />
          <line x1="12" y1="11" x2="6" y2="14" />
          <line x1="12" y1="11" x2="18" y2="14" />
        </svg>
      </span>
      <span className={styles.sacName}>{name}</span>
      {subagentType && <span className={styles.sacType}>{subagentType}</span>}
      {description && <span className={styles.sacDesc}>{description}</span>}
      <span className={styles.sacStatus}>
        {isRunning && (
          <span className={styles.sacDots}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {isCompleted && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 12 10 18 20 6" />
          </svg>
        )}
        {isError && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        )}
      </span>
      {childConversationId && (
        <span className={styles.sacNav} title="进入子会话">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </span>
      )}
    </div>
  )
}

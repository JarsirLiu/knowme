// ApprovalBar — shows approval UI for a tool call awaiting approval

import type { ToolCall } from '../types'
import styles from './ApprovalBar.module.css'

interface ApprovalBarProps {
  toolCall: ToolCall
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

function hasDisplayableArgs(args: unknown): boolean {
  return !!args && typeof args === 'object' && Object.keys(args).length > 0
}

export function ApprovalBar({ toolCall, onApprove, onDeny }: ApprovalBarProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.header}>
        <span className={styles.icon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <span className={styles.title}>需要审批</span>
        <code className={styles.toolName}>{toolCall.name}</code>
      </div>

      {hasDisplayableArgs(toolCall.args) && (
        <div className={styles.args}>
          <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.approveBtn}
          onClick={() => onApprove(toolCall.id)}
        >
          允许
        </button>
        <button
          type="button"
          className={styles.denyBtn}
          onClick={() => onDeny(toolCall.id)}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}

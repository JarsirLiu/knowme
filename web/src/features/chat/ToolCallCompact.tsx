import styles from './ToolCallCompact.module.css'

type ToolCallCompactProps = {
  name: string
  status: 'running' | 'completed' | 'failed'
}

export function ToolCallCompact({ name, status }: ToolCallCompactProps) {
  return (
    <div className={styles.toolCall}>
      <span className={styles.icon}>
        {status === 'running' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.spin}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : status === 'completed' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </span>
      <span className={styles.name}>{name}</span>
    </div>
  )
}
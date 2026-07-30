import styles from './ApprovalBanner.module.css'

type ApprovalBannerProps = {
  name: string
  args: unknown
  onApprove: () => void
  onReject: () => void
}

export function ApprovalBanner({ name, args, onApprove, onReject }: ApprovalBannerProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.header}>
        <span className={styles.warningIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <span>需要审批：<code className={styles.toolName}>{name}</code></span>
      </div>
      <div className={styles.args}>
        <pre>{JSON.stringify(args, null, 2)}</pre>
      </div>
      <div className={styles.actions}>
        <button className={styles.approveBtn} type="button" onClick={onApprove}>
          允许
        </button>
        <button className={styles.rejectBtn} type="button" onClick={onReject}>
          拒绝
        </button>
      </div>
    </div>
  )
}
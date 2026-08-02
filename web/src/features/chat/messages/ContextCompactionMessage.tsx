import type { ContextCompaction } from '../types'
import styles from './ContextCompactionMessage.module.css'

function label(compaction: ContextCompaction) {
  if (compaction.status === 'running') return '正在压缩上下文'
  if (compaction.status === 'failed') return '上下文压缩失败'
  if (compaction.reason) return '无需压缩上下文'
  return compaction.trigger === 'auto' ? '上下文已自动压缩' : '上下文已压缩'
}

export function ContextCompactionMessage({ compaction }: { compaction: ContextCompaction }) {
  return (
    <div className={`${styles.message} ${styles[compaction.status]}`} role="status">
      <span className={styles.icon} aria-hidden="true">
        {compaction.status === 'running' ? <span className={styles.spinner} /> : compaction.status === 'failed' ? '!' : '✓'}
      </span>
      <span className={styles.copy}>
        <span className={styles.title}>{label(compaction)}</span>
        {compaction.status === 'completed' && compaction.compactedItems !== undefined && !compaction.reason && (
          <span className={styles.detail}>已整理 {compaction.compactedItems} 条历史上下文</span>
        )}
        {compaction.status === 'failed' && compaction.error && <span className={styles.detail}>{compaction.error}</span>}
        {compaction.status === 'completed' && compaction.reason && <span className={styles.detail}>{compaction.reason}</span>}
      </span>
    </div>
  )
}

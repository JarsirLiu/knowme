import type { ContextCompaction } from '../types'
import styles from './ContextCompactionMessage.module.css'

function label(compaction: ContextCompaction) {
  if (compaction.status === 'running') return '正在压缩上下文'
  if (compaction.status === 'failed') return '上下文压缩失败'
  if (compaction.status === 'skipped') return '无需压缩上下文'
  if (compaction.reason) return '无需压缩上下文'
  return compaction.trigger === 'auto' ? '上下文已自动压缩' : '上下文已压缩'
}

function detail(compaction: ContextCompaction): string | null {
  if (compaction.status === 'completed' && compaction.compactedItems !== undefined && !compaction.reason) {
    return `已整理 ${compaction.compactedItems} 条历史上下文`
  }
  if (compaction.status === 'failed' && compaction.error) return compaction.error
  if (compaction.status === 'completed' && compaction.reason) return compaction.reason
  return null
}

export function ContextCompactionMessage({ compaction }: { compaction: ContextCompaction }) {
  const text = label(compaction)
  const sub = detail(compaction)
  return (
    <div className={`${styles.container} ${styles[compaction.status]}`} role="status">
      {compaction.status === 'running' ? (
        <span className={styles.shimmer}>{text}</span>
      ) : (
        <span className={styles.label}>
          {compaction.status === 'failed' ? '⚠' : compaction.status === 'skipped' ? '⊘' : '✓'}
          {' '}{text}
        </span>
      )}
      {sub && <span className={styles.detail}>{sub}</span>}
    </div>
  )
}

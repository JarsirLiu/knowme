// MessageList — renders all turns, handles scroll

import { useEffect, useRef } from 'react'
import type { ChatEntry } from '../types'
import { ContextCompactionMessage } from '../messages'
import { Turn } from './Turn'
import styles from './MessageList.module.css'

interface MessageListProps {
  entries: ChatEntry[]
  isLoading: boolean
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

export function MessageList({ entries, isLoading, onApprove, onDeny }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (stickToBottomRef.current) list.scrollTop = list.scrollHeight
  }, [entries])

  return (
    <div
      ref={listRef}
      className={styles.list}
      onScroll={() => {
        const list = listRef.current
        if (!list) return
        stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120
      }}
    >
      {entries.length === 0 && !isLoading ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          </div>
          <p className={styles.emptyTitle}>开始一个新对话</p>
          <p className={styles.emptyHint}>描述你的编程任务，Agent 会帮你完成</p>
        </div>
      ) : (
        <div className={styles.turns}>
          {entries.map((entry) => entry.type === 'turn' ? (
            <Turn key={entry.turn.id} turn={entry.turn} onApprove={onApprove} onDeny={onDeny} />
          ) : (
            <ContextCompactionMessage key={entry.compaction.id} compaction={entry.compaction} />
          ))}
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  )
}

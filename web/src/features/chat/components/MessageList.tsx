// MessageList — renders all turns, handles scroll

import { useEffect, useRef } from 'react'
import type { Turn as TurnType } from '../types'
import { Turn } from './Turn'
import styles from './MessageList.module.css'

interface MessageListProps {
  turns: TurnType[]
  isLoading: boolean
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

export function MessageList({ turns, isLoading, onApprove, onDeny }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  return (
    <div className={styles.list}>
      {turns.length === 0 && !isLoading ? (
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
          {turns.map((turn) => (
            <Turn
              key={turn.id}
              turn={turn}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          ))}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type { MessageContent } from '@superagent/core'
import { MessageItem } from './MessageItem'
import { ApprovalBanner } from './ApprovalBanner'
import styles from './MessageList.module.css'

interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: MessageContent[]
  pending?: boolean
}

type MessageListProps = {
  messages: UIMessage[]
  isLoading: boolean
  pendingToolCall: { id: string; name: string; args: unknown } | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export function MessageList({ messages, isLoading, pendingToolCall, onApprove, onReject }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={styles.messageList}>
      {messages.length === 0 && !isLoading && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          </div>
          <p className={styles.emptyTitle}>开始一个新对话</p>
          <p className={styles.emptyHint}>描述你的编程任务，Agent 会帮你完成</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageItem key={msg.id} role={msg.role} content={msg.content} pending={msg.pending} />
      ))}

      {pendingToolCall && (
        <div className={styles.approvalWrap}>
          <ApprovalBanner
            name={pendingToolCall.name}
            args={pendingToolCall.args}
            onApprove={() => onApprove(pendingToolCall.id)}
            onReject={() => onReject(pendingToolCall.id)}
          />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
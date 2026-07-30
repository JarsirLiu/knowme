import type { MessageContent } from '@superagent/core'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallCompact } from './ToolCallCompact'
import styles from './MessageItem.module.css'

interface MessageItemProps {
  role: 'user' | 'assistant' | 'tool'
  content: MessageContent[]
  pending?: boolean
}

export function MessageItem({ role, content, pending }: MessageItemProps) {
  const isUser = role === 'user'

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && <div className={styles.avatar}>A</div>}
      <div className={styles.bubble}>
        {content.map((part, i) => {
          if (part.type === 'text') {
            return <MarkdownContent key={i} content={part.text} />
          }
          if (part.type === 'tool_call') {
            return (
              <ToolCallCompact
                key={i}
                name={part.name}
                status="completed"
              />
            )
          }
          if (part.type === 'tool_result') {
            return (
              <div key={i} className={styles.toolResult}>
                <div className={styles.toolResultIcon}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className={styles.toolResultText}>工具执行完成</span>
              </div>
            )
          }
          return null
        })}
        {pending && <span className={styles.cursor}>▍</span>}
      </div>
    </div>
  )
}
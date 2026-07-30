// AssistantMessage — renders content + tool calls + approval bar based on status

import type { AssistantMessage as AssistantMessageType } from '../types'
import { TextMessage, ReasoningMessage } from '../messages'
import { ToolCallList } from './ToolCallItem'
import { ApprovalBar } from './ApprovalBar'
import styles from './AssistantMessage.module.css'

interface AssistantMessageProps {
  message: AssistantMessageType
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

export function AssistantMessage({ message, onApprove, onDeny }: AssistantMessageProps) {
  const awaitingApproval = message.toolCalls.find((tc) => tc.status === 'awaiting_approval')
  const isEmpty = message.content.length === 0 && message.toolCalls.length === 0

  return (
    <div className={`${styles.message} ${styles[message.status] || ''}`}>
      {isEmpty && message.status === 'streaming' ? (
        <span className={styles.cursor}>▍</span>
      ) : (
        <>
          <div className={styles.content}>
            {message.content.map((part, i) =>
              part.type === 'text' ? (
                <TextMessage key={`text-${i}`} content={part.text} />
              ) : (
                <ReasoningMessage key={`reasoning-${i}`} content={part.text} />
              )
            )}
          </div>

          {message.toolCalls.length > 0 && (
            <ToolCallList toolCalls={message.toolCalls} />
          )}

          {awaitingApproval && (
            <ApprovalBar
              toolCall={awaitingApproval}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          )}
        </>
      )}

      {message.status === 'incomplete' && (
        <div className={styles.incompleteBadge}>生成中断</div>
      )}
    </div>
  )
}

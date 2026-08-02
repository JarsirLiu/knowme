// AssistantMessage — renders content + tool calls + approval bar based on status

import type { AssistantMessage as AssistantMessageType } from '../types'
import { ContextCompactionMessage, TextMessage, ReasoningMessage } from '../messages'
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
  const parts = message.parts.length > 0
    ? message.parts
    : [
        ...message.content.map((content) => ({ type: 'content' as const, content })),
        ...message.toolCalls.map((tool) => ({ type: 'tool' as const, callId: tool.id })),
      ]

  return (
    <div className={`${styles.message} ${styles[message.status] || ''}`}>
      {isEmpty && message.status === 'streaming' ? (
        <span className={styles.cursor}>▍</span>
      ) : (
        <>
          <div className={styles.content}>
            {parts.map((part, i) => {
              if (part.type === 'compaction') {
                return <ContextCompactionMessage key={`compaction-${part.compaction.id}`} compaction={part.compaction} />
              }
              if (part.type === 'tool') {
                const toolCall = message.toolCalls.find((tool) => tool.id === part.callId)
                return toolCall ? <ToolCallList key={`tool-${part.callId}`} toolCalls={[toolCall]} /> : null
              }
              return part.content.type === 'text'
                ? <TextMessage key={`text-${i}`} content={part.content.text} />
                : <ReasoningMessage key={`reasoning-${i}`} content={part.content.text} />
            })}
          </div>

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

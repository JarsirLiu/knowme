import type { AssistantMessage as AssistantMessageType } from '../types'
import { TextMessage, ReasoningMessage } from '../messages'
import { ToolCallList } from './ToolCallItem'
import { SubAgentCard } from './SubAgentCard'
import { ApprovalBar } from './ApprovalBar'
import { ThinkingState } from './ThinkingState'
import styles from './AssistantMessage.module.css'

interface AssistantMessageProps {
  message: AssistantMessageType
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

export function AssistantMessage({ message, onApprove, onDeny }: AssistantMessageProps) {
  const awaitingApproval = message.toolCalls.find((tc) => tc.status === 'awaiting_approval')
  const isEmpty = message.content.length === 0 && message.toolCalls.length === 0
  const reasoningStreaming = message.status === 'streaming' &&
    message.content.length > 0 &&
    message.content[message.content.length - 1].type === 'reasoning'

  const parts = message.parts.length > 0
    ? message.parts
    : [
        ...message.content.map((content) => ({ type: 'content' as const, content })),
        ...message.toolCalls.map((tool) => ({ type: 'tool' as const, callId: tool.id })),
      ]

  return (
    <div className={`${styles.message} ${styles[message.status] || ''}`}>
      {isEmpty && message.status === 'streaming' ? (
        <ThinkingState />
      ) : (
        <>
          <div className={styles.content}>
            {parts.map((part, i) => {
              if (part.type === 'tool') {
                const toolCall = message.toolCalls.find((tool) => tool.id === part.callId)
                if (!toolCall) return null
                if (toolCall.name === 'delegate') {
                  return <SubAgentCard key={`delegate-${part.callId}`} toolCall={toolCall} />
                }
                return <ToolCallList key={`tool-${part.callId}`} toolCalls={[toolCall]} />
              }
              return part.content.type === 'text'
                ? <TextMessage key={`text-${i}`} content={part.content.text} />
                : <ReasoningMessage key={`reasoning-${i}`} content={part.content.text} isStreaming={reasoningStreaming} />
            })}
          </div>

          {awaitingApproval && (
            <ApprovalBar
              toolCall={awaitingApproval}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          )}

          {message.status === 'streaming' && !isEmpty && (
            <span className={styles.caret} aria-hidden="true" />
          )}
        </>
      )}

      {message.status === 'incomplete' && (
        <div className={styles.incompleteBadge}>
          <span>生成中断</span>
          {message.error && <span>{message.error}</span>}
        </div>
      )}
    </div>
  )
}
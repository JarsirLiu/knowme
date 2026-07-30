// Turn — a single user-assistant exchange

import type { Turn as TurnType } from '../types'
import { AssistantMessage } from './AssistantMessage'
import styles from './Turn.module.css'

interface TurnProps {
  turn: TurnType
  onApprove: (callId: string) => void
  onDeny: (callId: string) => void
}

export function Turn({ turn, onApprove, onDeny }: TurnProps) {
  return (
    <div className={styles.turn}>
      <div className={styles.userMessage}>
        <div className={styles.userBubble}>
          {turn.userMessage.content.map((c, i) => (
            <span key={i}>{c.text}</span>
          ))}
        </div>
      </div>

      <div className={styles.assistantMessage}>
        <AssistantMessage
          message={turn.assistantMessage}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      </div>
    </div>
  )
}

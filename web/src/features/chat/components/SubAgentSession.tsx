import type { SubAgentEvent, ToolCall } from '../types'
import { ReasoningMessage, TextMessage } from '../messages'
import { ToolCallList } from './ToolCallItem'
import { Orb } from './Orb'
import styles from './SubAgentSession.module.css'

function getTaskDescription(toolCall: ToolCall): string {
  const { args, rawArgs } = toolCall
  if (args && typeof args === 'object') {
    const record = args as Record<string, unknown>
    for (const key of ['task', 'description', 'prompt', 'query', 'input']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string
    }
  }
  if (typeof args === 'string' && args) return args
  if (rawArgs) {
    try {
      const parsed: unknown = JSON.parse(rawArgs)
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        for (const key of ['task', 'description', 'prompt', 'query', 'input']) {
          if (typeof record[key] === 'string' && record[key]) return record[key] as string
        }
      }
    } catch { /* ignore */ }
  }
  return ''
}

export function SubAgentSession({ toolCall }: { toolCall: ToolCall }) {
  const events = toolCall.subEvents ?? []
  const task = getTaskDescription(toolCall)
  const running = toolCall.status === 'running' || toolCall.status === 'awaiting_approval'
  const hasEvents = events.length > 0

  return (
    <div className={styles.session}>
      <div className={styles.taskRow}>
        <span className={styles.agentName}>{toolCall.name}</span>
        {running && <Orb size={16} />}
      </div>
      {task && (
        <div className={styles.taskBubble}>{task}</div>
      )}
      <div className={styles.events}>
        {events.map((event, i) => (
          <SubAgentEventItem key={i} event={event} isStreaming={running && i === events.length - 1} />
        ))}
        {!hasEvents && running && (
          <span className={styles.tciTaskRunning}>
            <Orb size={18} />
            <span className={styles.tciTaskLabel}>子agent 执行中…</span>
          </span>
        )}
      </div>
    </div>
  )
}

function SubAgentEventItem({ event, isStreaming }: { event: SubAgentEvent; isStreaming: boolean }) {
  if (event.type === 'reasoning') {
    return <ReasoningMessage content={event.text} isStreaming={isStreaming} />
  }
  if (event.type === 'text') {
    return (
      <div className={isStreaming ? styles.textStreaming : undefined}>
        <TextMessage content={event.text} />
        {isStreaming && <span className={styles.caret} aria-hidden="true" />}
      </div>
    )
  }
  return <ToolCallList toolCalls={[event.toolCall]} />
}
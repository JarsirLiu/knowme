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
          <SubAgentEventItem key={i} event={event} />
        ))}
        {!hasEvents && running && (
          <div className={styles.runningHint}>子agent 正在执行…</div>
        )}
      </div>
    </div>
  )
}

function SubAgentEventItem({ event }: { event: SubAgentEvent }) {
  if (event.type === 'reasoning') {
    return <ReasoningMessage content={event.text} isStreaming={false} />
  }
  if (event.type === 'text') {
    return <TextMessage content={event.text} />
  }
  return <ToolCallList toolCalls={[event.toolCall]} />
}
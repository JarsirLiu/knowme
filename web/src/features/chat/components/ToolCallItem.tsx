// ToolCallItem — renders a single tool call with status

import type { ToolCall } from '../types'
import styles from './ToolCallItem.module.css'

const TOOL_LABELS: Record<string, string> = {
  run_command: '运行命令',
  write_file: '写入文件',
  edit_file: '编辑文件',
  read_file: '读取文件',
  glob: '查找文件',
  grep: '搜索内容',
  list_dir: '列出目录',
}

function ToolIcon({ name, status }: { name: string; status: ToolCall['status'] }) {
  if (status === 'running') {
    return (
      <svg className={styles.spinner} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    )
  }

  if (status === 'awaiting_approval') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }

  if (status === 'completed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }

  if (status === 'denied') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    )
  }

  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    )
  }

  // incomplete
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function formatArgs(args: unknown): string {
  if (!args) return ''
  if (typeof args === 'string') return args
  try {
    const str = JSON.stringify(args, null, 2)
    return str.length > 200 ? str.slice(0, 200) + '...' : str
  } catch {
    return String(args)
  }
}

function hasArgs(args: unknown): boolean {
  return !!args && typeof args === 'object' && Object.keys(args as Record<string, unknown>).length > 0
}

export function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const label = TOOL_LABELS[toolCall.name] || toolCall.name
  const hasResult = toolCall.result !== undefined || toolCall.error !== undefined
  const isTerminal = toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.status === 'denied'
  const showArgs = hasArgs(toolCall.args)

  return (
    <div className={`${styles.toolCall} ${styles[toolCall.status] || ''}`}>
      <div className={styles.header}>
        <span className={styles.iconWrap}>
          <ToolIcon name={toolCall.name} status={toolCall.status} />
        </span>
        <span className={styles.label}>{label}</span>
        {toolCall.name !== label && (
          <code className={styles.name}>{toolCall.name}</code>
        )}
        {toolCall.status === 'running' && <span className={styles.statusBadge}>运行中</span>}
        {toolCall.status === 'awaiting_approval' && <span className={`${styles.statusBadge} ${styles.awaiting}`}>等待审批</span>}
      </div>

      {showArgs && (
        <details className={styles.details}>
          <summary className={styles.summary}>参数</summary>
          <pre className={styles.pre}>{formatArgs(toolCall.args)}</pre>
        </details>
      )}

      {hasResult && isTerminal && (
        <details className={styles.details} open={toolCall.status === 'failed'}>
          <summary className={styles.summary}>
            {toolCall.status === 'failed' ? '错误' : '结果'}
          </summary>
          <pre className={styles.pre}>
            {toolCall.error ? String(toolCall.error) : formatArgs(toolCall.result)}
          </pre>
        </details>
      )}
    </div>
  )
}

export function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (toolCalls.length === 0) return null

  return (
    <div className={styles.list}>
      {toolCalls.map((tc) => (
        <ToolCallItem key={tc.id} toolCall={tc} />
      ))}
    </div>
  )
}

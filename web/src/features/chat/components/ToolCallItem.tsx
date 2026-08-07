import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, CircleX, FilePenLine, FolderSearch, LoaderCircle, Terminal } from 'lucide-react'
import type { ToolCall } from '../types'
import styles from './ToolCallItem.module.css'

const TOOL_LABELS: Record<string, { running: string; completed: string }> = {
  run_command: { running: '正在运行', completed: '已运行' },
  write_file: { running: '正在写入', completed: '已写入' },
  edit_file: { running: '正在编辑', completed: '已编辑' },
  read_file: { running: '正在读取', completed: '已读取' },
  glob: { running: '正在查找', completed: '已查找' },
  grep: { running: '正在搜索', completed: '已搜索' },
  list_dir: { running: '正在列出', completed: '已列出' },
}

type ActionSummary = { verb: string; detail?: string }

function ToolIcon({ name, status }: { name: string; status: ToolCall['status'] }) {
  if (status === 'running') return <LoaderCircle className={styles.spinner} size={14} aria-hidden="true" />
  if (status === 'failed' || status === 'denied') return <CircleX size={14} aria-hidden="true" />
  if (name === 'run_command') return <Terminal size={14} aria-hidden="true" />
  if (name === 'edit_file' || name === 'write_file') return <FilePenLine size={14} aria-hidden="true" />
  if (name === 'glob' || name === 'grep') return <FolderSearch size={14} aria-hidden="true" />
  return <Check size={14} aria-hidden="true" />
}

function tryExtract(args: unknown, keys: string[]): unknown {
  if (!args || typeof args !== 'object') return null
  const obj = args as Record<string, unknown>
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key]
  }
  return null
}

function parseRawArgs(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function getCommandValue(args: unknown, rawArgs?: string): unknown {
  const value = tryExtract(args, ['commands', 'command', 'cmd', 'commandToRun'])
    ?? tryExtract(parseRawArgs(rawArgs ?? ''), ['commands', 'command', 'cmd', 'commandToRun'])
  return value
}

function getCommands(args: unknown, rawArgs?: string): string[] {
  const value = getCommandValue(args, rawArgs)
  if (Array.isArray(value)) {
    return value.filter((command) => typeof command === 'string' && command.trim()).map(String)
  }
  return value ? [String(value)] : []
}

function getCommand(args: unknown, rawArgs?: string): string | null {
  const commands = getCommands(args, rawArgs)
  if (commands.length === 0) return null
  return commands.length === 1 ? commands[0] : `${commands[0]} (+${commands.length - 1} 条命令)`
}

function formatShellCommands(args: unknown, rawArgs?: string): string {
  return getCommands(args, rawArgs).map((command) => `$ ${command}`).join('\n')
}

function getTarget(args: unknown, rawArgs?: string): string | null {
  const value = tryExtract(args, ['path', 'file', 'filePath', 'directory', 'pattern', 'query', 'needle'])
    ?? tryExtract(parseRawArgs(rawArgs ?? ''), ['path', 'file', 'filePath', 'directory', 'pattern', 'query', 'needle'])
  return value ? String(value) : null
}

function getSummary(tc: ToolCall, running: boolean): ActionSummary {
  const { name, args, rawArgs } = tc

  if (name === 'run_command') {
    const command = getCommand(args, rawArgs)
    if (command) return { verb: running ? '正在运行' : '已运行', detail: command }
  }

  const target = getTarget(args, rawArgs)
  const label = TOOL_LABELS[name] ?? { running: '正在执行', completed: name }
  if (target) {
    return { verb: running ? label.running : label.completed, detail: target }
  }

  return { verb: running ? label.running : label.completed }
}

function getDiffStats(result: unknown): string | null {
  if (typeof result !== 'string') return null
  const match = result.match(/(\+\d+)\s*(-\d+)/)
  return match ? match[0] : null
}

function fmtResult(result: unknown): string {
  if (result === undefined || result === null || result === '') return ''
  if (typeof result === 'string') return result
  if (typeof result === 'number' || typeof result === 'boolean') return String(result)
  try { return JSON.stringify(result, null, 2) } catch { return String(result) }
}

const ARG_LABELS: Record<string, string> = {
  type: '操作',
  path: '文件',
  file: '文件',
  filePath: '文件',
  directory: '目录',
  pattern: '匹配',
  query: '搜索',
  needle: '搜索',
  moveTo: '移动到',
}

function fmtArgs(args: unknown): string {
  if (!args) return ''
  if (typeof args === 'string') return args
  if (typeof args !== 'object') return String(args)
  return Object.entries(args as Record<string, unknown>)
    .filter(([key, value]) => value !== undefined && value !== null && key !== 'commands')
    .map(([key, value]) => {
      const label = ARG_LABELS[key] ?? key
      if (key === 'diff') return '补丁：已提供'
      if (Array.isArray(value)) return `${label}：${value.map(String).join('、')}`
      if (typeof value === 'object') {
        try { return `${label}：${JSON.stringify(value)}` } catch { return `${label}：${String(value)}` }
      }
      return `${label}：${String(value)}`
    })
    .join('\n')
}

export function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const { name, args, rawArgs, status, result, error } = toolCall
  const running = status === 'running'
  const summary = getSummary(toolCall, running)
  const diffStats = getDiffStats(result)
  const resultText = fmtResult(result)
  const displayArgs = parseRawArgs(rawArgs ?? '') ?? args
  const argsText = name === 'run_command' ? formatShellCommands(args, rawArgs) : fmtArgs(displayArgs)
  const showDetails = !!argsText || result !== undefined || !!error
  const hasExpanded = showDetails && (expanded ?? (status === 'completed' && result !== undefined))

  if (running) {
    return (
      <div className={styles.running}>
        <span className={styles.icon}><ToolIcon name={name} status={status} /></span>
        <span className={styles.text}>{summary.verb} {summary.detail && <code>{summary.detail}</code>}</span>
      </div>
    )
  }

  if (status === 'awaiting_approval') {
    return (
      <div className={styles.awaitingApproval}>
        <div className={styles.approvalHeader}>
          <span className={styles.icon}><ToolIcon name={name} status={status} /></span>
          <span className={styles.approvalLabel}>{summary.verb} {summary.detail && <code>{summary.detail}</code>}</span>
          <span className={styles.statusBadge}>等待审批</span>
        </div>
        {argsText && <div className={styles.approvalArgs}><pre>{argsText}</pre></div>}
      </div>
    )
  }

  const isFailed = status === 'failed'

  return (
    <div className={`${styles.item} ${isFailed ? styles.failed : ''}`}>
      <button
        className={styles.summaryBtn}
        onClick={() => setExpanded((value) => !(value ?? (status === 'completed' && result !== undefined)))}
        disabled={!showDetails}
        aria-expanded={showDetails ? hasExpanded : undefined}
      >
        <span className={styles.icon}><ToolIcon name={name} status={status} /></span>
        <span className={styles.text}>{summary.verb} {summary.detail && <code>{summary.detail}</code>}</span>
        {status === 'failed' && <span className={styles.badge}>失败</span>}
        {status === 'denied' && <span className={styles.badgeDenied}>已拒绝</span>}
        {diffStats && <span className={styles.diffStats}>{diffStats}</span>}
        {showDetails && <span className={styles.chevron}>{hasExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
      </button>

      {hasExpanded && (
        <div className={styles.expand}>
          {name === 'run_command' ? (
            <div className={styles.shellBlock}>
              <div className={styles.shellHeader}>Shell</div>
              {argsText && <pre className={`${styles.pre} ${styles.commandPre}`}>{argsText}</pre>}
              {resultText && <pre className={`${styles.pre} ${styles.outputPre}`}>{resultText}</pre>}
            </div>
          ) : (
            <>
              {argsText && (
                <div className={styles.shellBlock}>
                  <div className={styles.shellHeader}>调用信息</div>
                  <pre className={styles.pre}>{argsText}</pre>
                </div>
              )}
              {resultText && (
                <div className={styles.shellBlock}>
                  {status !== 'failed' && <div className={styles.shellHeader}>调用结果</div>}
                  <pre className={styles.pre}>{resultText}</pre>
                </div>
              )}
            </>
          )}
          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}
    </div>
  )
}

export function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (toolCalls.length === 0) return null
  return (
    <div className={styles.list}>
      {toolCalls.map((tc) => <ToolCallItem key={tc.id} toolCall={tc} />)}
    </div>
  )
}

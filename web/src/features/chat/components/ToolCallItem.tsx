import { useState } from 'react'
import type { ToolCall } from '../types'
import { DiffMessage } from '../messages/DiffMessage'
import { Orb } from './Orb'
import { SubAgentSession } from './SubAgentSession'
import styles from './ToolCallItem.module.css'

function Dots() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" />
    </svg>
  )
}

function Caret() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  )
}

const TOOL_HEADER_LABELS: Record<string, string> = {
  run_command: 'Running',
  web_search: 'Searching',
  write_file: 'Writing',
  edit_file: 'Editing',
  read_file: 'Reading',
  glob: 'Finding',
  grep: 'Searching',
  list_dir: 'Listing',
  task: 'Task',
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
  return commands.length === 1 ? commands[0] : `${commands[0]} (+${commands.length - 1})`
}

function getTarget(args: unknown, rawArgs?: string): string | null {
  const value = tryExtract(args, ['path', 'file', 'filePath', 'directory', 'pattern', 'query', 'needle'])
    ?? tryExtract(parseRawArgs(rawArgs ?? ''), ['path', 'file', 'filePath', 'directory', 'pattern', 'query', 'needle'])
  return value ? String(value) : null
}

function fmtResult(result: unknown): string {
  if (result === undefined || result === null || result === '') return ''
  if (typeof result === 'string') return result
  if (typeof result === 'number' || typeof result === 'boolean') return String(result)
  try { return JSON.stringify(result, null, 2) } catch { return String(result) }
}

function getToolQuote(tc: ToolCall): string | null {
  const { name, args, rawArgs } = tc
  if (name === 'run_command') return getCommand(args, rawArgs)
  return getTarget(args, rawArgs)
}

function getToolResult(tc: ToolCall): string {
  return fmtResult(tc.result)
}

type EditArgs = { type: 'create_file' | 'update_file' | 'delete_file'; path: string; diff?: string }

function getEditArgs(tc: ToolCall): EditArgs | null {
  if (tc.name !== 'edit_file') return null
  const args = tc.args ?? parseRawArgs(tc.rawArgs ?? '')
  if (!args || typeof args !== 'object') return null
  const obj = args as Record<string, unknown>
  const type = obj.type
  const path = obj.path
  const diff = obj.diff
  if (typeof type === 'string' && typeof path === 'string') {
    return { type: type as EditArgs['type'], path: String(path), diff: typeof diff === 'string' ? diff : undefined }
  }
  return null
}

export function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const { name, status, error } = toolCall
  const running = status === 'running'
  const isDone = status === 'completed' || status === 'failed' || status === 'denied'

  const isSubAgent = !!toolCall.subEvents || name === 'explore_project' || name === 'review_code_quality' || name === 'task'
  const hasSubEvents = !!(toolCall.subEvents && toolCall.subEvents.length > 0)

  const headerVerb = TOOL_HEADER_LABELS[name] ?? name
  const quote = getToolQuote(toolCall)
  const resultText = getToolResult(toolCall)
  const editArgs = getEditArgs(toolCall)

  const hasDiff = !!(editArgs && editArgs.type === 'update_file' && editArgs.diff && isDone && !error)
  const editDiff = hasDiff ? editArgs!.diff! : null
  const hasContent = !!quote || !!resultText || !!error || running || hasDiff || hasSubEvents

  const headerText = quote ? `${headerVerb} "${quote}"` : headerVerb

  if (status === 'awaiting_approval') {
    const approvalQuote = getToolQuote(toolCall)
    return (
      <div className={styles.tciAwaiting}>
        <div className={styles.tciAwaitingHeader}>
          <span className={styles.tciLabel}>{headerText}</span>
        </div>
        <div className={styles.tciAwaitingBody}>
          Awaiting approval
        </div>
      </div>
    )
  }

  return (
    <div className={styles.tci}>
      <div className={styles.tciRow}>
        <span className={`${styles.tciLabel} ${styles.tciShimmer} ${isDone ? styles.isDone : ''}`}>
          <span className={styles.tciVerb}>{headerVerb}</span>
          {quote && <span className={styles.tciQuote}> "{quote}"</span>}
        </span>
        {hasContent && (
          <button
            className={styles.tciChevron}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <Caret />
          </button>
        )}
      </div>
      {hasContent && (
        <div className={`${styles.tciCollapsible} ${!expanded ? styles.isCollapsed : ''}`}>
          <div className={styles.tciCollapsibleInner}>
            {hasSubEvents && (
              <SubAgentSession toolCall={toolCall} />
            )}
            {!hasSubEvents && hasDiff && editDiff && (
              <DiffMessage
                diffs={[{
                  path: editArgs!.path,
                  additions: editDiff.match(/^\+/gm)?.length || 0,
                  deletions: editDiff.match(/^\-/gm)?.length || 0,
                  patch: editDiff,
                }]}
              />
            )}
            {!hasSubEvents && !hasDiff && (
              <div className={styles.tciTerminal}>
                {running && isSubAgent && (
                  <span className={styles.tciTaskRunning}>
                    <Orb size={18} />
                    <span className={styles.tciTaskLabel}>子agent 执行中…</span>
                  </span>
                )}
                {running && !isSubAgent && (
                  <div className={styles.tciLoading}>
                    <span className={styles.tciDots}><Dots /></span>
                    <span className={styles.tciLoadingText}>Running...</span>
                  </div>
                )}
                {resultText && (
                  <pre className={styles.tciOutput}>{resultText}</pre>
                )}
                {error && (
                  <pre className={`${styles.tciOutput} ${styles.tciError}`}>{error}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (toolCalls.length === 0) return null
  return (
    <div className={styles.tciList}>
      {toolCalls.map((tc) => <ToolCallItem key={tc.id} toolCall={tc} />)}
    </div>
  )
}
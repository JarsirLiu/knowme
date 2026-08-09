import { useState } from 'react'
import type { ToolCall } from '../types'
import styles from './ToolCallItem.module.css'

function Dots() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function Search() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  )
}

function Terminal() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 15 10 12l-3-3" />
      <path d="M13 18.5h4" />
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

function ArrowUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  )
}

const TOOL_ICONS: Record<string, 'terminal' | 'search' | 'file' | 'folder' | 'grep'> = {
  run_command: 'terminal',
  web_search: 'search',
  write_file: 'file',
  edit_file: 'file',
  read_file: 'file',
  glob: 'search',
  grep: 'grep',
  list_dir: 'folder',
}

function ToolIcon({ name }: { name: string }) {
  const kind = TOOL_ICONS[name] ?? 'search'
  switch (kind) {
    case 'terminal': return <Terminal />
    case 'search': return <Search />
    case 'file':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6" />
        </svg>
      )
    case 'folder':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8l2 2h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1Z" />
        </svg>
      )
    case 'grep': return <Search />
    default: return <Search />
  }
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
}

const M = {
  L: "M6.057 11.565 C2.081 11.565 0.371 8.159 0.371 5.964 C0.371 3.642 2.152 0.329 6.05 0.329",
  ML: "M6.012 11.55 C4.575 10.496 3.333 8.116 3.321 5.964 C3.307 3.399 4.974 0.977 6.012 0.329",
  MR: "M6.012 11.55 C7.211 10.781 8.715 8.287 8.715 5.964 C8.715 3.399 7.24 1.233 6.012 0.329",
  R: "M6.012 11.55 C9.677 11.55 11.65 8.487 11.65 5.964 C11.65 3.499 9.748 0.329 6.012 0.329",
};

function Globe() {
  const values = [M.L, M.ML, M.MR, M.R, M.L].join(";");
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="0.85" strokeLinecap="round" style={{ overflow: "visible" }}>
      <circle cx="6" cy="6" r="5.7" opacity="0.9" />
      <line x1="0.3" y1="6" x2="11.7" y2="6" opacity="0.9" />
      {["0s", "-1.2s", "-2.4s", "-3.6s", "-4.8s", "-6s"].map((begin) => (
        <path key={begin} d={M.L} opacity="0">
          <animate attributeName="d" dur="7.2s" begin={begin} repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.25;0.5;0.75;1"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" values={values} />
          <animate attributeName="opacity" dur="7.2s" begin={begin} repeatCount="indefinite"
            calcMode="linear" keyTimes="0;0.05;0.7;0.75;1" values="0;0.9;0.9;0;0" />
        </path>
      ))}
    </svg>
  )
}

const TOOL_LABELS: Record<string, string> = {
  run_command: 'run_command',
  write_file: 'write_file',
  edit_file: 'edit_file',
  read_file: 'read_file',
  glob: 'glob',
  grep: 'grep',
  list_dir: 'list_dir',
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

export function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const { name, status, error } = toolCall
  const running = status === 'running'
  const isDone = status === 'completed' || status === 'failed' || status === 'denied'
  const isError = status === 'failed' || status === 'denied'

  const headerVerb = TOOL_HEADER_LABELS[name] ?? name
  const quote = getToolQuote(toolCall)
  const resultText = getToolResult(toolCall)
  const hasDetails = !!quote || !!resultText || !!error

  const items: Array<{ title: string; value: string; isError?: boolean }> = []
  if (quote) {
    items.push({ title: name === 'run_command' ? 'Shell' : 'Target', value: quote })
  } else if (running) {
    items.push({ title: name === 'run_command' ? 'Shell' : 'Target', value: 'Loading...' })
  }
  if (resultText) {
    items.push({ title: 'Output', value: resultText })
  } else if (running) {
    items.push({ title: 'Output', value: 'Waiting...' })
  }
  if (error) {
    items.push({ title: 'Error', value: error, isError: true })
  }

  const itemState = running ? 'loading' : 'done'
  const showItems = items.length > 0
  const isExpanded = expanded ?? (running || isError || hasDetails)

  const headerText = quote ? `${headerVerb} "${quote}"` : headerVerb

  if (status === 'awaiting_approval') {
    const approvalQuote = getToolQuote(toolCall)
    return (
      <div className={styles.tciAwaiting}>
        <div className={styles.tciAwaitingHeader}>
          <ToolIcon name={name} />
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
        {showItems && (
          <button
            className={styles.tciChevron}
            onClick={() => setExpanded((v) => !(v ?? (running || isError)))}
            aria-expanded={isExpanded}
          >
            <Caret />
          </button>
        )}
      </div>
      {showItems && (
        <div className={`${styles.tciCollapsible} ${!isExpanded ? styles.isCollapsed : ''}`}>
          <div className={styles.tciCollapsibleInner}>
            <div className={styles.tciResults}>
              <div className={styles.tciRail} />
              <div className={styles.tciList}>
                {items.map((item, i) => (
                  <div
                    key={i}
                    className={`${styles.tciSite} ${item.isError ? styles.isError : ''}`}
                    data-state={itemState}
                  >
                    <span className={styles.tciBullet}>
                      <span className={styles.tciDots}><Dots /></span>
                      <span className={styles.tciGlobe}><Globe /></span>
                      <span className={styles.tciCheck}><Check /></span>
                    </span>
                    <span className={styles.tciTitle}>{item.title}</span>
                    <span className={styles.tciSep}>·</span>
                    <span className={styles.tciUrl}>{item.value}</span>
                    <span className={styles.tciArrow}><ArrowUp /></span>
                  </div>
                ))}
              </div>
            </div>
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
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SkillInfo } from '@superagent/core'
import { buildCommandList, type CmdItem } from './commands'
import { CommandMenu } from './components/CommandMenu'
import styles from './InputBar.module.css'

type InputBarProps = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  onCompact?: () => void
  isLoading: boolean
  placeholder?: string
  skills?: SkillInfo[]
}

export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  onCompact,
  isLoading,
  placeholder = '随心输入',
  skills = [],
}: InputBarProps) {
  const [focused, setFocused] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [commandFilter, setCommandFilter] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const allCommands = useMemo<CmdItem[]>(() => buildCommandList(skills), [skills])

  const filtered = useMemo(() => {
    if (!commandFilter) return allCommands
    const lower = commandFilter.toLowerCase()
    return allCommands.filter((c) => c.label.toLowerCase().includes(lower))
  }, [allCommands, commandFilter])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [value])

  const selectCommand = (cmd: CmdItem) => {
    if (cmd.type === 'system' && cmd.label === '/compact') {
      onCompact?.()
      setShowCommands(false)
      textareaRef.current?.focus()
      return
    }
    const cursor = textareaRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const slashIdx = before.lastIndexOf('/')
    const newBefore = slashIdx >= 0 ? before.slice(0, slashIdx) : before
    const newValue = newBefore + cmd.insert + ' ' + after
    onChange(newValue)
    setShowCommands(false)
    textareaRef.current?.focus()
  }

  const handleChange = (v: string) => {
    onChange(v)
    const cursor = textareaRef.current?.selectionStart ?? v.length
    const before = v.slice(0, cursor)
    const slashIdx = before.lastIndexOf('/')
    if (slashIdx >= 0) {
      const afterSlash = before.slice(slashIdx + 1)
      if (!afterSlash.includes(' ')) {
        setCommandFilter(afterSlash)
        setShowCommands(true)
        setSelectedIndex(0)
      } else {
        setShowCommands(false)
      }
    } else {
      setShowCommands(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          selectCommand(filtered[selectedIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommands(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSend()
    }
  }

  const canSend = value.trim()

  return (
    <div className={styles.inputBarWrap}>
      <CommandMenu
        commands={filtered}
        show={showCommands}
        selectedIndex={selectedIndex}
        onSelect={selectCommand}
        onClose={() => setShowCommands(false)}
        onSelectedIndexChange={setSelectedIndex}
      />
      <div className={`${styles.inputBar} ${focused ? styles.inputBarFocused : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.inputTextarea}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <div className={styles.inputFooter}>
          <button className={styles.plusButton} type="button" title="添加附件">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className={`${styles.sendButton} ${isLoading ? styles.sendButtonStop : canSend ? styles.sendButtonSend : styles.sendButtonDisabled}`}
            type="button"
            disabled={!canSend && !isLoading}
            onClick={() => (isLoading && onStop ? onStop() : canSend ? onSend() : undefined)}
            title={isLoading ? '停止' : '发送'}
          >
            {isLoading ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
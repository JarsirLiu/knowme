import { useState } from 'react'
import styles from './InputBar.module.css'

type InputBarProps = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  isLoading: boolean
  placeholder?: string
}

export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  placeholder = '随心输入',
}: InputBarProps) {
  const [focused, setFocused] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSend()
    }
  }

  const canSend = value.trim()

  return (
    <div className={styles.inputBarWrap}>
      <div className={`${styles.inputBar} ${focused ? styles.inputBarFocused : ''}`}>
        <button className={styles.plusButton} type="button" title="添加附件">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <textarea
          className={styles.inputTextarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <button
          className={`${styles.sendButton} ${isLoading ? styles.sendButtonStop : canSend ? styles.sendButtonSend : styles.sendButtonDisabled}`}
          type="button"
          disabled={!canSend && !isLoading}
          onClick={() => (isLoading && onStop ? onStop() : canSend ? onSend() : undefined)}
          title={isLoading ? '停止' : '发送'}
        >
          {isLoading ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

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
  placeholder = '随心输入…',
}: InputBarProps) {
  const [focused, setFocused] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSend()
    }
  }

  return (
    <div className={styles.inputBarWrap}>
      <div className={`${styles.inputBar} ${focused ? styles.inputBarFocused : ''}`}>
        <button className={styles.plusButton} type="button" title="添加附件">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
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
          className={`${styles.sendButton} ${isLoading ? styles.sendButtonStop : value.trim() ? styles.sendButtonActive : styles.sendButtonDisabled}`}
          type="button"
          disabled={!value.trim() && !isLoading}
          onClick={() => (isLoading && onStop ? onStop() : value.trim() ? onSend() : undefined)}
          title={isLoading ? '停止生成' : '发送'}
        >
          {isLoading && onStop ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>
      <div className={styles.inputBarHint}>
        <span>按 Enter 发送，Shift+Enter 换行</span>
      </div>
    </div>
  )
}
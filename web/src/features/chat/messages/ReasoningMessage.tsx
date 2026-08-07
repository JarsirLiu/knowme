import { useState } from 'react'
import { TextMessage } from './TextMessage'

interface ReasoningMessageProps {
  content: string
}

export function ReasoningMessage({ content }: ReasoningMessageProps) {
  const [open, setOpen] = useState(false)

  if (!content) return null

  return (
    <div className="reasoning-message">
      <button
        type="button"
        className="reasoning-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="reasoning-text">
          {open ? '▾' : '▸'} 思考过程
        </span>
      </button>
      <div className={`reasoning-content ${open ? 'reasoning-open' : ''}`}>
        <TextMessage content={content} />
      </div>
    </div>
  )
}

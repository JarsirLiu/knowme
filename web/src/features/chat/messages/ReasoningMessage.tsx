import { useState } from 'react'
import { TextMessage } from './TextMessage'

interface ReasoningMessageProps {
  content: string
}

export function ReasoningMessage({ content }: ReasoningMessageProps) {
  const [open, setOpen] = useState(true)

  if (!content) return null

  return (
    <div className="reasoning-message">
      <button
        type="button"
        className="reasoning-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="reasoning-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58A2.5 2.5 0 0 1 5 2h4.5Z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58A2.5 2.5 0 0 0 19 2h-4.5Z" />
          </svg>
        </span>
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

import { Children, isValidElement, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import styles from './TextMessage.module.css'

type ElementProps = { children?: ReactNode; className?: string }

function elementProps(value: ReactNode): ElementProps | undefined {
  return isValidElement(value) ? value.props as ElementProps : undefined
}

function textContent(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textContent).join('')
  if (isValidElement(value)) return textContent(elementProps(value)?.children)
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const child = Children.toArray(children).find(isValidElement)
  const childProps = child ? elementProps(child) : undefined
  const codeClassName = typeof childProps?.className === 'string' ? childProps.className : ''
  const language = codeClassName.match(/language-([\w-]+)/)?.[1] ?? 'text'
  const source = textContent(childProps?.children ?? children).replace(/\n$/, '')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard access can be unavailable in local, non-secure browser contexts.
    }
  }

  return (
    <div className={styles.codeFrame}>
      <div className={styles.codeHeader}>
        <span>{language}</span>
        <button type="button" className={styles.copyButton} onClick={copy} title="复制代码">
          {copied ? '已复制' : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

export function TextMessage({ content }: { content: string }) {
  if (!content) return null
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ children, className }) => {
            const isBlock = Boolean(className?.includes('language-'))
            return isBlock ? (
              <code className={styles.codeBlock}>{children}</code>
            ) : (
              <code className={styles.inlineCode}>{children}</code>
            )
          },
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          table: ({ children }) => <div className={styles.tableWrap}><table>{children}</table></div>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          hr: () => <hr />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

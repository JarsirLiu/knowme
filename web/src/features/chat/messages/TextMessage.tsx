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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const lines = code.split("\n")
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className={styles.cb}>
      <div className={styles.cbHead}>
        <span className={styles.cbFile}>
          <svg className={styles.cbIcon} viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="m8 6-6 6 6 6M16 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className={styles.cbLang}>{lang}</span>
        </span>
        <button className={styles.cbCopy} onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>
          {copied ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" /></svg>
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className={styles.cbBody}>
        {lines.map((line, i) => (
          <div className={styles.cbRow} key={i}>
            <span className={styles.cbLn}>{i + 1}</span>
            <code className={styles.cbCode}>{line || "\u00A0"}</code>
          </div>
        ))}
      </div>
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
          pre: ({ children }) => {
            const child = Children.toArray(children).find(isValidElement)
            const childProps = child ? elementProps(child) : undefined
            const codeClassName = typeof childProps?.className === 'string' ? childProps.className : ''
            const lang = codeClassName.match(/language-([\w-]+)/)?.[1] ?? 'text'
            const code = textContent(childProps?.children ?? children).replace(/\n$/, '')
            return <CodeBlock lang={lang} code={code} />
          },
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
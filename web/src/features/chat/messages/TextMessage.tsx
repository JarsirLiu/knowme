import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function TextMessage({ content }: { content: string }) {
  if (!content) return null
  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
          pre: ({ children }) => (
            <pre style={{
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: 14,
              borderRadius: 8,
              overflowX: 'auto',
              margin: '10px 0',
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = !!className
            return isBlock ? (
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{children}</code>
            ) : (
              <code style={{
                background: '#e8e8e8',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: '0.88em',
                fontFamily: 'var(--font-mono)',
                color: '#333',
                lineHeight: 1.4,
              }}>
                {children}
              </code>
            )
          },
          a: ({ children, href }) => (
            <a href={href} style={{ color: '#0066cc', textDecoration: 'none' }} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0 10px 20px', padding: 0 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.7 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '8px 0',
              paddingLeft: 12,
              borderLeft: '3px solid var(--color-border)',
              color: 'var(--color-muted)',
            }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table style={{
              margin: '10px 0',
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: 13,
            }}>{children}</table>
          ),
          th: ({ children }) => (
            <th style={{
              padding: '6px 10px',
              borderBottom: '2px solid var(--color-border)',
              textAlign: 'left',
              fontWeight: 600,
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--color-border-soft)',
            }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

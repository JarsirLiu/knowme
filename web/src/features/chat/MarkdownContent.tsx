import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        pre: ({ children }) => <pre style={{ overflowX: 'auto', padding: '12px', background: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>{children}</pre>,
        code: ({ children, ...props }) => {
          const isInline = !props.className
          return isInline ? (
            <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }}>{children}</code>
          ) : (
            <code {...props} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{children}</code>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
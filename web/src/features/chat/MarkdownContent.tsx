import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

import type { MarkdownContentProps } from "./types";

export function MarkdownContent({ text }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.7 }}>{children}</p>,
        a: ({ children, href }) => (
          <a href={href} style={{ color: "#0066cc" }} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = typeof className === "string";
          if (isBlock) {
            return (
              <pre
                style={{
                  background: "var(--color-bg-soft)",
                  padding: 12,
                  borderRadius: 8,
                  overflowX: "auto",
                  margin: "8px 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: "1px solid var(--color-border-soft)",
                }}
              >
                <code style={{ fontFamily: "var(--font-mono)", color: "#333" }}>{children}</code>
              </pre>
            );
          }
          return (
            <code
              style={{
                background: "var(--color-bg-user)",
                padding: "2px 5px",
                borderRadius: 4,
                fontSize: "0.9em",
                color: "#c7254e",
                fontFamily: "var(--font-mono)",
              }}
            >
              {children}
            </code>
          );
        },
        ul: ({ children }) => <ul style={{ margin: "4px 0 8px 20px", padding: 0 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "4px 0 8px 20px", padding: 0 }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.7 }}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote style={{ margin: "8px 0", paddingLeft: 12, borderLeft: "3px solid var(--color-border)", color: "var(--color-muted)" }}>
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong style={{ color: "var(--text-primary)" }}>{children}</strong>,
        h1: ({ children }) => <h2 style={{ margin: "16px 0 8px", fontSize: 20 }}>{children}</h2>,
        h2: ({ children }) => <h3 style={{ margin: "14px 0 6px", fontSize: 18 }}>{children}</h3>,
        h3: ({ children }) => <h4 style={{ margin: "12px 0 4px", fontSize: 16 }}>{children}</h4>,
        table: ({ children }) => (
          <div style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ border: "1px solid var(--color-border)", padding: "6px 10px", textAlign: "left", background: "var(--color-bg-soft)", fontWeight: 600 }}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ border: "1px solid var(--color-border)", padding: "6px 10px" }}>{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

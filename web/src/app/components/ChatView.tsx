'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatTransport,
  getStaticToolName,
  isReasoningUIPart,
  isToolUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from 'ai';
import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

type ChatViewProps = {
  title: string;
  description: string;
  placeholder: string;
  sessionId: string;
  initialMessages?: UIMessage[];
  transport?: ChatTransport<UIMessage>;
  onTitleChange?: (title: string) => void;
};

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

function IconPlus({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSend({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconTerminal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconFileEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconTool({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconSparkles({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown (light theme)                                             */
/* ------------------------------------------------------------------ */

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{children}</p>,
        a: ({ children, href }) => (
          <a href={href} style={{ color: '#0066cc' }} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = typeof className === 'string';
          if (isBlock) {
            return (
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 8,
                  overflowX: 'auto',
                  margin: '8px 0',
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: '1px solid #eaeaea',
                }}
              >
                <code style={{ fontFamily: 'monospace', color: '#333' }}>{children}</code>
              </pre>
            );
          }
          return (
            <code
              style={{
                background: '#f0f0f0',
                padding: '2px 5px',
                borderRadius: 4,
                fontSize: '0.9em',
                color: '#c7254e',
                fontFamily: 'monospace',
              }}
            >
              {children}
            </code>
          );
        },
        ul: ({ children }) => (
          <ul style={{ margin: '4px 0 8px 20px', padding: 0 }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: '4px 0 8px 20px', padding: 0 }}>{children}</ol>
        ),
        li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.7 }}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote
            style={{
              margin: '8px 0',
              paddingLeft: 12,
              borderLeft: '3px solid #ddd',
              color: '#666',
            }}
          >
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong style={{ color: '#1a1a1a' }}>{children}</strong>,
        h1: ({ children }) => <h2 style={{ margin: '16px 0 8px', fontSize: 20 }}>{children}</h2>,
        h2: ({ children }) => <h3 style={{ margin: '14px 0 6px', fontSize: 18 }}>{children}</h3>,
        h3: ({ children }) => <h4 style={{ margin: '12px 0 4px', fontSize: 16 }}>{children}</h4>,
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid #ddd',
              padding: '6px 10px',
              textAlign: 'left',
              background: '#f8f8f8',
              fontWeight: 600,
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool call compact display                                          */
/* ------------------------------------------------------------------ */

function getToolIcon(name: string) {
  if (name === 'run_command') return <IconTerminal />;
  if (name === 'write_file') return <IconFileEdit />;
  if (name === 'read_file') return <IconFileEdit />;
  if (name === 'search_code') return <IconSearch />;
  return <IconTool />;
}

function getToolLabel(name: string, state: string) {
  const labels: Record<string, string> = {
    run_command: '运行命令',
    write_file: '编辑文件',
    read_file: '读取文件',
    search_code: '搜索代码',
    list_files: '列出文件',
    run_npm: '运行 npm',
  };
  const action = state === 'in-progress' || state === 'approval-requested' ? '正在' : '已';
  return `${action}${labels[name] ?? '调用工具'}`;
}

function ToolCallCompact({
  part,
  index,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  let toolName = '';
  let toolState = '';
  let toolInput: unknown = undefined;
  let toolOutput: unknown = undefined;
  let toolError = '';

  if (part.type === 'dynamic-tool') {
    toolName = part.toolName;
    toolState = part.state;
    toolInput = part.input;
    toolOutput = part.output;
    toolError = part.errorText ?? '';
  } else if (isToolUIPart(part)) {
    toolName = getStaticToolName(part);
    toolState = part.state;
    toolInput = (part as { input?: unknown }).input;
    toolOutput = (part as { output?: unknown }).output;
    toolError = (part as { errorText?: string }).errorText ?? '';
  }

  const hasDetails =
    toolInput !== undefined || toolOutput !== undefined || toolError;

  return (
    <div
      key={`tool-${toolName}-${index}`}
      style={{
        marginTop: 8,
        fontSize: 13,
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: hasDetails ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      onClick={() => hasDetails && setExpanded((v) => !v)}
    >
      {getToolIcon(toolName)}
      <span>{getToolLabel(toolName, toolState)}</span>
      {toolState === 'in-progress' && (
        <span
          style={{
            width: 12,
            height: 12,
            border: '2px solid #e0e0e0',
            borderTopColor: '#666',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            display: 'inline-block',
          }}
        />
      )}
      {hasDetails && (
        <span style={{ marginLeft: 4, color: '#bbb' }}>
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      )}

      {expanded && hasDetails && (
        <div
          style={{
            width: '100%',
            marginTop: 8,
            padding: 10,
            background: '#f8f8f8',
            borderRadius: 8,
            border: '1px solid #eee',
            color: '#444',
            fontSize: 12,
            fontFamily: 'monospace',
            lineHeight: 1.5,
          }}
        >
          {toolInput !== undefined && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#666' }}>Input</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(toolInput, null, 2)}
              </pre>
            </div>
          )}
          {toolOutput !== undefined && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#666' }}>Output</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2)}
              </pre>
            </div>
          )}
          {toolError && (
            <div style={{ color: '#c7254e' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Error</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{toolError}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Approval banner                                                    */
/* ------------------------------------------------------------------ */

function ApprovalBanner({
  part,
  onApprove,
  onReject,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const approvalId = String(
    (part as Record<string, unknown>).approvalId ??
      (part as Record<string, unknown>).toolCallId ??
      '',
  );
  if (!approvalId) return null;

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 14px',
        borderRadius: 8,
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        fontSize: 13,
        color: '#92400e',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        需要审批：工具调用 {(part as Record<string, unknown>).toolCallId as string}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onApprove(approvalId)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: '#22c55e',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          批准
        </button>
        <button
          type="button"
          onClick={() => onReject(approvalId)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          拒绝
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  onApprove,
  onReject,
}: {
  message: UIMessage;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // 系统消息不显示气泡
  if (isSystem) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          margin: '8px 0',
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#999',
            background: '#f5f5f5',
            padding: '4px 12px',
            borderRadius: 12,
          }}
        >
          {message.parts
            ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('') || ''}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        margin: '4px 0',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '12px 16px',
          borderRadius: 14,
          backgroundColor: isUser ? '#f0f0f0' : '#ffffff',
          color: '#1a1a1a',
          lineHeight: 1.6,
          fontSize: 15,
          boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
          border: isUser ? 'none' : '1px solid #eee',
        }}
      >
        {message.parts?.map((part, index) => (
          <MessagePart
            key={`${message.id}-part-${index}`}
            part={part}
            index={index}
            onApprove={onApprove}
            onReject={onReject}
          />
        )) ?? <MarkdownContent text={message.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('') ?? ''} />}
      </div>
    </div>
  );
}

function MessagePart({
  part,
  index,
  onApprove,
  onReject,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  index: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (part.type === 'text') {
    return <MarkdownContent text={part.text} />;
  }

  if (isReasoningUIPart(part)) {
    return (
      <details style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>思考过程</summary>
        <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: '2px solid #ddd', color: '#888' }}>
          <MarkdownContent text={part.text} />
        </div>
      </details>
    );
  }

  if (part.type === 'tool-approval-request') {
    return <ApprovalBanner part={part} onApprove={onApprove} onReject={onReject} />;
  }

  if (isToolUIPart(part) || (part as { type: string }).type === 'dynamic-tool') {
    return <ToolCallCompact part={part} index={index} />;
  }

  if (part.type.startsWith('data-')) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: 8,
          background: '#f8f8f8',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#666',
        }}
      >
        {part.type}
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  ChatView                                                           */
/* ------------------------------------------------------------------ */

export default function ChatView({
  title,
  description,
  placeholder,
  sessionId,
  initialMessages,
  transport,
  onTitleChange,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
  } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport,
  });
  const messageList = useMemo(() => messages ?? [], [messages]);

  const onApprove = (approvalId: string) =>
    void addToolApprovalResponse({ id: approvalId, approved: true });
  const onReject = (approvalId: string) =>
    void addToolApprovalResponse({ id: approvalId, approved: false });

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageList]);

  // 只在首次收到用户消息时提取一次标题
  const titleRef = useRef(false);
  useEffect(() => {
    if (onTitleChange && messageList.length > 0 && !titleRef.current) {
      const firstUser = messageList.find((m) => m.role === 'user');
      if (firstUser) {
        titleRef.current = true;
        const text =
          firstUser.parts?.find((p) => p.type === 'text')?.text ?? '';
        const title = text.slice(0, 30).trim() || '新对话';
        onTitleChange(title);
      }
    }
  }, [messageList, onTitleChange]);

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#ffffff',
      }}
    >
      {/* 顶部标题栏 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #eee',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: '#1a1a1a',
            }}
          >
            {title}
          </h1>
          <span
            style={{
              fontSize: 12,
              color: '#999',
              background: '#f5f5f5',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {description}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e0e0e0',
              background: '#fff',
              color: '#666',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            新对话
          </button>
        </div>
      </header>

      {/* 消息区域 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 20px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {error ? (
          <div
            style={{
              margin: '0 auto 16px',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 13,
              maxWidth: 600,
            }}
          >
            错误：{error.message}
          </div>
        ) : null}

        {messageList.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              color: '#999',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ccc',
              }}
            >
              <IconSparkles size={24} />
            </div>
            <div style={{ fontSize: 15, color: '#666' }}>
              发送消息开始对话
            </div>
            <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', maxWidth: 400 }}>
              我可以帮你写代码、改 bug、搜索代码、执行命令……
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 800, width: '100%', margin: '0 auto', paddingBottom: 20 }}>
            {messageList.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
            {isLoading && messageList[messageList.length - 1]?.role === 'user' && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', margin: '8px 0' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 14,
                    background: '#fff',
                    border: '1px solid #eee',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: '#888',
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid #e0e0e0',
                      borderTopColor: '#666',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  思考中…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部输入区 */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 20px 20px',
          background: '#fff',
          borderTop: '1px solid transparent',
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.trim()) return;
            sendMessage({ text: input }, { body: { sessionId } });
            setInput('');
          }}
          style={{
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              padding: '10px 14px',
              background: '#f8f8f8',
              borderRadius: 20,
              border: '1px solid #e8e8e8',
            }}
          >
            <button
              type="button"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid #ddd',
                background: '#fff',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title="添加附件"
            >
              <IconPlus size={16} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim()) {
                    sendMessage({ text: input }, { body: { sessionId } });
                    setInput('');
                  }
                }
              }}
              placeholder={placeholder}
              rows={1}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 15,
                color: '#1a1a1a',
                resize: 'none',
                lineHeight: 1.5,
                padding: '5px 0',
                fontFamily: 'inherit',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: input.trim() && !isLoading ? '#1a1a1a' : '#e0e0e0',
                color: input.trim() && !isLoading ? '#fff' : '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <IconSend size={16} />
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              paddingLeft: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#aaa' }}>
              按 Enter 发送，Shift+Enter 换行
            </span>
          </div>
        </form>
      </div>

      {/* 全局动画样式 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

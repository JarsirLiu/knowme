'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DefaultChatTransport } from 'ai';
import ChatView from './components/ChatView';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = 'superagent-sessions';

function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function IconMessageSquare({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconBot({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({
  sessions,
  currentId,
  onSelect,
  onNew,
}: {
  sessions: ChatSession[];
  currentId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: '#f8f8f8',
        borderRight: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {/* 顶部 Logo */}
      <div
        style={{
          padding: '16px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#1a1a1a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconBot size={16} />
        </div>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#1a1a1a',
            letterSpacing: '-0.3px',
          }}
        >
          SuperAgent
        </span>
      </div>

      {/* 新对话按钮 */}
      <div style={{ padding: '0 16px 12px' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e0e0e0',
            background: '#fff',
            color: '#1a1a1a',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = '#f0f0f0';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = '#fff';
          }}
        >
          <IconPlus size={14} />
          新对话
        </button>
      </div>

      {/* 会话列表 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 8px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            padding: '8px 8px 4px',
          }}
        >
          历史记录
        </div>
        {sessions.length === 0 ? (
          <div
            style={{
              padding: '16px 8px',
              fontSize: 13,
              color: '#aaa',
              textAlign: 'center',
            }}
          >
            暂无对话
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === currentId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: isActive ? '#e8e8e8' : 'transparent',
                  color: isActive ? '#1a1a1a' : '#555',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: isActive ? 500 : 400,
                  transition: 'background 0.15s',
                  overflow: 'hidden',
                }}
                title={session.title}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.target as HTMLElement).style.background = '#eee';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                <IconMessageSquare
                  size={14}
                  style={{
                    flexShrink: 0,
                    color: isActive ? '#1a1a1a' : '#aaa',
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.title}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* 底部信息 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e8e8e8',
          fontSize: 11,
          color: '#aaa',
          textAlign: 'center',
        }}
      >
        SuperAgent v0.1.0
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  HomeClient                                                         */
/* ------------------------------------------------------------------ */

export default function HomeClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [currentTitle, setCurrentTitle] = useState<string>('新对话');

  // 初始化
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    if (loaded.length > 0) {
      setCurrentId(loaded[0].id);
      setCurrentTitle(loaded[0].title);
    } else {
      const id = generateId();
      setCurrentId(id);
    }
  }, []);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat' }),
    [],
  );

  const handleNew = useCallback(() => {
    const id = generateId();
    setCurrentId(id);
    setCurrentTitle('新对话');
  }, []);

  const handleSelect = useCallback((id: string) => {
    setCurrentId(id);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setCurrentTitle(session.title);
    }
  }, [sessions]);

  const handleTitleChange = useCallback(
    (title: string) => {
      setCurrentTitle(title);
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === currentId);
        let next: ChatSession[];
        if (exists) {
          next = prev.map((s) =>
            s.id === currentId ? { ...s, title, updatedAt: Date.now() } : s,
          );
        } else {
          next = [
            { id: currentId, title, createdAt: Date.now(), updatedAt: Date.now() },
            ...prev,
          ];
        }
        // 按更新时间排序，最多保留 50 条
        next = next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
        saveSessions(next);
        return next;
      });
    },
    [currentId],
  );

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar
        sessions={sessions}
        currentId={currentId}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <ChatView
          title={currentTitle}
          description="Coding Agent"
          placeholder="随心输入…"
          sessionId={currentId}
          transport={transport}
          onTitleChange={handleTitleChange}
        />
      </div>
    </div>
  );
}

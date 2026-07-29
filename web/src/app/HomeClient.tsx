'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';

import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Header } from '@/features/chat/Header';
import { MessageList } from '@/features/chat/MessageList';
import { InputBar } from '@/features/chat/InputBar';

import { getItem, setItem, generateId } from '@/shared';

import styles from './HomeClient.module.css';

/* ---- Session types ---- */

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = 'superagent-sessions';

/* ---- HomeClient ---- */

export default function HomeClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [currentTitle, setCurrentTitle] = useState<string>('新对话');

  // 初始化
  useEffect(() => {
    const loaded = getItem<ChatSession[]>(SESSIONS_KEY);
    setSessions(loaded ?? []);
    if (loaded && loaded.length > 0) {
      setCurrentId(loaded[0].id);
      setCurrentTitle(loaded[0].title);
    } else {
      const id = generateId();
      setCurrentId(id);
    }
  }, []);

  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: '/api/chat' }),
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
        next = next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
        setItem(SESSIONS_KEY, next);
        return next;
      });
    },
    [currentId],
  );

  return (
    <div className={styles.appLayout}>
      <Sidebar
        sessions={sessions}
        currentId={currentId}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <div className={styles.mainPane}>
        <ChatView
          title={currentTitle}
          description="Coding Agent"
          sessionId={currentId}
          transport={transport}
          onTitleChange={handleTitleChange}
        />
      </div>
    </div>
  );
}

/* ---- ChatView (composes Header + MessageList + InputBar) ---- */

function ChatView({
  title,
  description,
  sessionId,
  transport,
  onTitleChange,
}: {
  title: string;
  description: string;
  sessionId: string;
  transport: DefaultChatTransport<UIMessage>;
  onTitleChange: (title: string) => void;
}) {
  const [input, setInput] = useState('');
  const [messageList, setMessageList] = useState<UIMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
  } = useChat({
    id: sessionId,
    transport,
  });

  // 同步消息
  useEffect(() => {
    setMessageList(messages ?? []);
  }, [messages]);

  const onApprove = (approvalId: string) =>
    void addToolApprovalResponse({ id: approvalId, approved: true });
  const onReject = (approvalId: string) =>
    void addToolApprovalResponse({ id: approvalId, approved: false });

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <div className={styles.chatView}>
      <Header
        title={title}
        description={description}
        onNew={() => {
          if (typeof window !== 'undefined') window.location.reload();
        }}
      />

      {error ? (
        <div className={styles.errorBanner}>
          错误：{error.message}
        </div>
      ) : null}

      <MessageList
        messages={messageList}
        isLoading={isLoading}
        onApprove={onApprove}
        onReject={onReject}
        onTitleChange={onTitleChange}
        scrollRef={scrollRef}
      />

      <InputBar
        value={input}
        onChange={setInput}
        onSend={() => {
          if (!input.trim()) return;
          sendMessage({ text: input }, { body: { sessionId } });
          setInput('');
        }}
        isLoading={isLoading}
      />
    </div>
  );
}

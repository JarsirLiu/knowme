import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { Header, MessageList, InputBar, useAgentChat } from '@/features/chat'
import { client } from '@/api/client'
import styles from './HomeClient.module.css'

interface ChatSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface ProjectGroup {
  name: string
  icon: string
  sessions: { id: string; title: string; createdAt: number; updatedAt: number }[]
}

export default function HomeClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  const [currentTitle, setCurrentTitle] = useState<string>('New Session')
  const [input, setInput] = useState('')
  const [initialized, setInitialized] = useState(false)

  const {
    turns,
    isLoading,
    error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
  } = useAgentChat(currentId)

  const projects: ProjectGroup[] = [
    { name: 'superagent', icon: '📁', sessions: [] },
  ]

  useEffect(() => {
    client.listSessions().then((list) => {
      if (list.length > 0) {
        setCurrentId(list[0].id)
        setCurrentTitle(list[0].name)
        setSessions(list)
        setInitialized(true)
      } else {
        client.createSession().then((s) => {
          setCurrentId(s.id)
          setCurrentTitle(s.name)
          setSessions([s])
          setInitialized(true)
        })
      }
    })
  }, [])

  const handleNew = useCallback(async () => {
    const s = await client.createSession()
    setCurrentId(s.id)
    setCurrentTitle(s.name)
    setSessions((prev) => [s, ...prev])
  }, [])

  const handleSelect = useCallback((id: string) => {
    setCurrentId(id)
    const session = sessions.find((s) => s.id === id)
    if (session) setCurrentTitle(session.name)
  }, [sessions])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }, [input, sendMessage])

  if (!initialized) return null

  return (
    <div className={styles.appLayout}>
      <Sidebar
        projects={projects}
        sessions={sessions.map((s) => ({ id: s.id, title: s.name, createdAt: 0, updatedAt: 0 }))}
        currentId={currentId}
        isLoading={isLoading}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <div className={styles.mainPane}>
        <div className={styles.chatView}>
          <Header title={currentTitle} onNew={handleNew} />

          {error ? (
            <div className={styles.errorBanner}>错误：{error}</div>
          ) : null}

          <MessageList
            turns={turns}
            isLoading={isLoading}
            onApprove={approveTool}
            onDeny={denyTool}
          />

          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={stop}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}

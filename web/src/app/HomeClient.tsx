import { useCallback, useEffect, useState } from 'react'
import type { Conversation, Project } from '@superagent/core'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { Header, MessageList, InputBar, useAgentChat } from '@/features/chat'
import type { ActiveConversation } from '@/features/chat/hooks/useAgentChat'
import { client } from '@/api/client'
import { ProjectModal } from '@/components/ProjectModal/ProjectModal'
import styles from './HomeClient.module.css'

function createDraft(projectId: string): ActiveConversation {
  return {
    kind: 'draft',
    draftId: crypto.randomUUID(),
    projectId,
    title: '新任务',
  }
}

export default function HomeClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [conversationsByProject, setConversationsByProject] = useState<Record<string, Conversation[]>>({})
  const [activeProjectId, setActiveProjectId] = useState('')
  const [active, setActive] = useState<ActiveConversation | null>(null)
  const [input, setInput] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  const handleConversationCreated = useCallback((data: { conversationId: string; title: string }) => {
    setActive((current) => {
      if (!current || current.kind !== 'draft') return current
      return { ...current, conversationId: data.conversationId, title: data.title }
    })
    setConversationsByProject((current) => {
      if (!activeProjectId) return current
      const existing = current[activeProjectId] ?? []
      if (existing.some((conversation) => conversation.id === data.conversationId)) return current
      const conversation: Conversation = {
        id: data.conversationId,
        projectId: activeProjectId,
        title: data.title,
        status: 'active',
        agentProfile: 'coding',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return { ...current, [activeProjectId]: [conversation, ...existing] }
    })
  }, [activeProjectId])

  const {
    turns,
    isLoading,
    error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
  } = useAgentChat(active, handleConversationCreated)

  useEffect(() => {
    let cancelled = false
    async function loadWorkspace() {
      const nextProjects = await client.listProjects()
      const pairs = await Promise.all(
        nextProjects.map(async (project) => [project.id, await client.listConversations(project.id)] as const),
      )
      if (cancelled) return

      const nextConversations = Object.fromEntries(pairs)
      const firstProject = nextProjects[0]
      const firstConversation = firstProject ? nextConversations[firstProject.id]?.[0] : undefined
      setProjects(nextProjects)
      setConversationsByProject(nextConversations)
      if (firstProject) {
        setActiveProjectId(firstProject.id)
        setActive(firstConversation
          ? { kind: 'persisted', conversationId: firstConversation.id, projectId: firstProject.id }
          : createDraft(firstProject.id))
      }
      setInitialized(true)
    }

    loadWorkspace().catch(() => {
      if (!cancelled) setInitialized(true)
    })
    return () => { cancelled = true }
  }, [])

  const handleNew = useCallback((projectId: string) => {
    if (!projectId || isLoading) return
    setActiveProjectId(projectId)
    setActive(createDraft(projectId))
    setInput('')
    setMobileNavOpen(false)
  }, [activeProjectId, isLoading])

  const handleNewProject = useCallback(() => {
    if (isLoading) return
    setProjectModalOpen(true)
  }, [isLoading])

  const handleCreateProject = useCallback(async ({ name, rootPath }: { name: string; rootPath: string }) => {
    setCreatingProject(true)
    try {
      const project = await client.createProject({ name, rootPath })
      setProjects((current) => [project, ...current])
      setConversationsByProject((current) => ({ ...current, [project.id]: [] }))
      setActiveProjectId(project.id)
      setActive(createDraft(project.id))
      setMobileNavOpen(false)
      setProjectModalOpen(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      setCreatingProject(false)
    }
  }, [])

  const handleSelectProject = useCallback((projectId: string) => {
    if (isLoading) return
    setActiveProjectId(projectId)
    const firstConversation = conversationsByProject[projectId]?.[0]
    setActive(firstConversation
      ? { kind: 'persisted', conversationId: firstConversation.id, projectId }
      : createDraft(projectId))
    setInput('')
    setMobileNavOpen(false)
  }, [conversationsByProject, isLoading])

  const handleSelectConversation = useCallback((conversationId: string, projectId: string) => {
    if (isLoading) return
    setActiveProjectId(projectId)
    setActive({ kind: 'persisted', conversationId, projectId })
    setInput('')
    setMobileNavOpen(false)
  }, [isLoading])

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return
    const message = input
    setInput('')
    void sendMessage(message)
  }, [input, isLoading, sendMessage])

  const activeTitle = active?.kind === 'persisted'
    ? conversationsByProject[active.projectId]?.find((conversation) => conversation.id === active.conversationId)?.title ?? '任务'
    : active?.title ?? '新任务'

  if (!initialized) {
    return <div className={styles.loadingScreen}>正在加载本地工作区…</div>
  }

  return (
    <div className={styles.appLayout}>
      {mobileNavOpen && <button className={styles.mobileBackdrop} type="button" aria-label="关闭项目导航" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar
        projects={projects}
        conversationsByProject={conversationsByProject}
        activeProjectId={activeProjectId}
        active={active}
        isLoading={isLoading}
        mobileOpen={mobileNavOpen}
        onSelectProject={handleSelectProject}
        onSelectConversation={handleSelectConversation}
        onNew={handleNew}
        onNewProject={handleNewProject}
      />

      <main className={styles.mainPane}>
        <Header title={activeTitle} onOpenNavigation={() => setMobileNavOpen(true)} />

        {error && <div className={styles.errorBanner}>{error}</div>}

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
          placeholder="描述你要完成的任务…"
        />
      </main>

      <ProjectModal
        open={projectModalOpen}
        isSubmitting={creatingProject}
        onClose={() => setProjectModalOpen(false)}
        onSubmit={handleCreateProject}
      />
    </div>
  )
}

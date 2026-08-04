import { useCallback, useEffect, useState } from 'react'
import type { Conversation, Project } from '@superagent/core'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { Header, MessageList, InputBar, useAgentChat } from '@/features/chat'
import type { ActiveConversation, ConversationDisplayStatus } from '@/features/chat/hooks/useAgentChat'
import { client } from '@/api/client'
import { ProjectModal } from '@/components/ProjectModal/ProjectModal'
import { DirectoryPickerModal } from '@/components/DirectoryPickerModal/DirectoryPickerModal'
import styles from './HomeClient.module.css'

function createDraft(projectId: string): ActiveConversation {
  return {
    kind: 'draft',
    draftId: crypto.randomUUID(),
    projectId,
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
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)

  const handleConversationCreated = useCallback((data: { conversationId: string; title: string; draftId: string; projectId: string }) => {
    setActive((current) => {
      if (!current || current.kind !== 'draft' || current.draftId !== data.draftId || current.projectId !== data.projectId) return current
      return {
        kind: 'persisted',
        conversationId: data.conversationId,
        projectId: current.projectId,
      }
    })
    setConversationsByProject((current) => {
      const existing = current[data.projectId] ?? []
      if (existing.some((conversation) => conversation.id === data.conversationId)) return current
      const now = new Date().toISOString()
      const conversation: Conversation = {
        id: data.conversationId,
        projectId: data.projectId,
        title: data.title,
        status: 'active',
        agentProfile: 'coding',
        runtimeStatus: 'queued',
        createdAt: now,
        updatedAt: now,
      }
      return { ...current, [data.projectId]: [conversation, ...existing] }
    })
  }, [])

  const {
    entries,
    isLoading,
    error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
    disposeConversation,
    statusByConversation,
  } = useAgentChat(active, handleConversationCreated)

  const persistedConversationStatuses = Object.fromEntries(
    Object.values(conversationsByProject)
      .flat()
      .map((conversation) => [conversation.id, conversation.runtimeStatus ?? 'idle']),
  ) as Record<string, ConversationDisplayStatus>
  const conversationStatuses = { ...persistedConversationStatuses, ...statusByConversation }

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
    if (!projectId) return
    setActiveProjectId(projectId)
    setActive(createDraft(projectId))
    setInput('')
    setMobileNavOpen(false)
  }, [])

  const handleNewProject = useCallback(() => {
    setSelectedDirectory(null)
    setProjectModalOpen(true)
  }, [])

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
      return true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setCreatingProject(false)
    }
  }, [])

  const handleSelectProjectDirectory = useCallback(() => {
    setDirectoryPickerOpen(true)
  }, [])

  const handleDirectorySelected = useCallback(async (directory: string) => {
    const normalizedPath = directory.replace(/[\\/]+$/, '')
    const lastPart = normalizedPath.split(/[\\/]/).pop() || normalizedPath
    const name = /^[A-Za-z]:$/.test(lastPart) ? `${lastPart[0].toUpperCase()} 盘` : lastPart

    setSelectedDirectory(directory)
    setDirectoryPickerOpen(false)
    setProjectModalOpen(false)

    const created = await handleCreateProject({ name, rootPath: directory })
    if (!created) setProjectModalOpen(true)
  }, [handleCreateProject])

  const handleSelectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId)
    const firstConversation = conversationsByProject[projectId]?.[0]
    setActive(firstConversation
      ? { kind: 'persisted', conversationId: firstConversation.id, projectId }
      : createDraft(projectId))
    setInput('')
    setMobileNavOpen(false)
  }, [conversationsByProject])

  const handleSelectConversation = useCallback((conversationId: string, projectId: string) => {
    setActiveProjectId(projectId)
    setActive({ kind: 'persisted', conversationId, projectId })
    setInput('')
    setMobileNavOpen(false)
  }, [])

  const handleDeleteConversation = useCallback(async (conversationId: string, projectId: string) => {
    if (deletingConversationId) return
    const conversations = conversationsByProject[projectId] ?? []
    const target = conversations.find((conversation) => conversation.id === conversationId)
    if (!target) return
    if (!window.confirm(`删除会话“${target.title}”？`)) return

    setDeletingConversationId(conversationId)
    try {
      await client.deleteConversation(conversationId)
      disposeConversation(conversationId)
      const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId)
      setConversationsByProject((current) => ({
        ...current,
        [projectId]: (current[projectId] ?? []).filter((conversation) => conversation.id !== conversationId),
      }))

      const activeConversationId = active?.kind === 'persisted' ? active.conversationId : undefined
      const deletingActive = activeConversationId === conversationId
      if (deletingActive) {
        const nextConversation = nextConversations[0]
        setActiveProjectId(projectId)
        setActive(nextConversation
          ? { kind: 'persisted', conversationId: nextConversation.id, projectId }
          : createDraft(projectId))
        setInput('')
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      setDeletingConversationId(null)
    }
  }, [active, conversationsByProject, deletingConversationId, disposeConversation])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    if (!active) {
      setProjectModalOpen(true)
      return
    }
    const message = input
    setInput('')
    void sendMessage(message)
  }, [active, input, sendMessage])

  const activeTitle = active?.kind === 'persisted'
    ? conversationsByProject[active.projectId]?.find((conversation) => conversation.id === active.conversationId)?.title ?? '任务'
    : '新任务'

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
        conversationStatuses={conversationStatuses}
        mobileOpen={mobileNavOpen}
        onSelectProject={handleSelectProject}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNew={handleNew}
        onNewProject={handleNewProject}
        deletingConversationId={deletingConversationId}
      />

      <main className={styles.mainPane}>
        <Header title={activeTitle} onOpenNavigation={() => setMobileNavOpen(true)} />

        {error && <div className={styles.errorBanner}>{error}</div>}

        <MessageList
          entries={entries}
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
        selectedDirectory={selectedDirectory}
        onClose={() => setProjectModalOpen(false)}
        onSelectDirectory={handleSelectProjectDirectory}
        onSubmit={handleCreateProject}
      />
      <DirectoryPickerModal
        open={directoryPickerOpen}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={handleDirectorySelected}
      />
    </div>
  )
}

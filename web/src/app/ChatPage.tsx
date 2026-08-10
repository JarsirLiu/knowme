import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Header, InputBar, MessageList, useAgentChat } from '@/features/chat'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUIStore } from '@/stores/ui'
import { client } from '@/api/client'
import { ProjectModal } from '@/components/ProjectModal/ProjectModal'
import { DirectoryPickerModal } from '@/components/DirectoryPickerModal/DirectoryPickerModal'
import type { SkillInfo } from '@superagent/core'
import styles from './ChatPage.module.css'

function findParentConversation(
  conversationsByProject: Record<string, unknown[]>,
  parentId: string,
): string | undefined {
  for (const conversations of Object.values(conversationsByProject)) {
    for (const c of conversations) {
      const conv = c as { id: string; title: string; parentConversationId?: string | null }
      if (conv.id === parentId && !conv.parentConversationId) return conv.title
    }
  }
  return undefined
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const { conversationId: urlConversationId } = useParams<{ conversationId: string }>()

  const active = useWorkspaceStore((state) => state.active)
  const conversationsByProject = useWorkspaceStore((state) => state.conversationsByProject)
  const createProject = useWorkspaceStore((state) => state.createProject)
  const handleConversationCreated = useWorkspaceStore((state) => state.handleConversationCreated)
  const selectConversation = useWorkspaceStore((state) => state.selectConversation)
  const fetchConversation = useWorkspaceStore((state) => state.fetchConversation)
  const projectModalOpen = useUIStore((state) => state.projectModalOpen)
  const setProjectModalOpen = useUIStore((state) => state.setProjectModalOpen)
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen)
  const setConversationRuntimeStatuses = useUIStore((state) => state.setConversationRuntimeStatuses)

  // When a URL param is present, select that conversation automatically.
  useEffect(() => {
    if (!urlConversationId) return
    for (const [projectId, conversations] of Object.entries(conversationsByProject)) {
      const found = conversations.find((c) => c.id === urlConversationId)
      if (found) {
        selectConversation(urlConversationId, projectId)
        return
      }
    }
    // Not yet in the store (e.g. a child session created during a delegate call).
    void fetchConversation(urlConversationId).then((projectId) => {
      if (projectId) selectConversation(urlConversationId, projectId)
    })
  }, [urlConversationId, conversationsByProject, selectConversation, fetchConversation])

  const activeConversationIds = useMemo(
    () => Object.values(conversationsByProject)
      .flat()
      .filter((conversation) => conversation.runtimeStatus === 'queued'
        || conversation.runtimeStatus === 'running'
        || conversation.runtimeStatus === 'waiting_approval')
      .map((conversation) => conversation.id),
    [conversationsByProject],
  )

  const {
    entries,
    isLoading,
    error,
    sendMessage,
    compactContext,
    approveTool,
    denyTool,
    stop,
    statusByConversation,
  } = useAgentChat(client, active, activeConversationIds, handleConversationCreated)

  useEffect(() => {
    setConversationRuntimeStatuses(statusByConversation)
  }, [statusByConversation, setConversationRuntimeStatuses])

  const activeProjectId = active?.projectId
  useEffect(() => {
    if (!activeProjectId) {
      setSkills([])
      return
    }
    let cancelled = false
    void client.getProjectSkills(activeProjectId)
      .then((list) => { if (!cancelled) setSkills(list) })
      .catch(() => { if (!cancelled) setSkills([]) })
    return () => { cancelled = true }
  }, [activeProjectId])

  const handleNewProject = useCallback(() => {
    setSelectedDirectory(null)
    setProjectModalOpen(true)
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

    setCreatingProject(true)
    const created = await createProject(name, directory)
    setCreatingProject(false)
    if (!created) setProjectModalOpen(true)
  }, [createProject])

  const handleCreateProject = useCallback(async ({ name, rootPath }: { name: string; rootPath: string }) => {
    setCreatingProject(true)
    const result = await createProject(name, rootPath)
    setCreatingProject(false)
    if (result) setProjectModalOpen(false)
    return result
  }, [createProject])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    if (text === '/compact') {
      setInput('')
      void compactContext()
      return
    }
    if (!active) {
      setProjectModalOpen(true)
      return
    }
    setInput('')
    void sendMessage(text)
  }, [active, input, sendMessage, compactContext])

  const activeTitle = active?.kind === 'persisted'
    ? conversationsByProject[active.projectId]?.find((conversation) => conversation.id === active.conversationId)?.title ?? '任务'
    : '新任务'

  const location = useLocation()
  const parentConversationId = (location.state as { parentId?: string } | null)?.parentId
  const isChildSession = !!parentConversationId
  const parentTitle = isChildSession
    ? findParentConversation(conversationsByProject, parentConversationId!)
    : undefined

  const handleBack = useCallback(() => {
    if (parentConversationId) {
      navigate(`/chat/${parentConversationId}`)
    }
  }, [parentConversationId, navigate])

  const inputBarVisible = !isChildSession

  return (
    <main className={styles.mainPane}>
      <Header
        title={activeTitle}
        onOpenNavigation={!isChildSession ? () => setMobileNavOpen(true) : undefined}
        parentTitle={parentTitle}
        onBack={isChildSession ? handleBack : undefined}
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <MessageList
        entries={entries}
        isLoading={isLoading}
        onApprove={approveTool}
        onDeny={denyTool}
      />

      {inputBarVisible && (
        <InputBar
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={stop}
          onCompact={compactContext}
          isLoading={isLoading}
          placeholder="Do anything"
          skills={skills}
        />
      )}

      {isChildSession && (
        <div className={styles.childFooter}>
          <button className={styles.backButton} onClick={handleBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{parentTitle ? `返回 ${parentTitle}` : '返回主会话'}</span>
          </button>
        </div>
      )}

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
    </main>
  )
}
import { useCallback, useMemo, useRef, useState } from 'react'
import { Header, InputBar, MessageList, useAgentChat } from '@/features/chat'
import type { ConversationDisplayStatus } from '@/stores/workspace'
import { useWorkspaceStore } from '@/stores/workspace'
import { ProjectModal } from '@/components/ProjectModal/ProjectModal'
import { DirectoryPickerModal } from '@/components/DirectoryPickerModal/DirectoryPickerModal'
import styles from './ChatPage.module.css'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)

  const active = useWorkspaceStore((state) => state.active)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const conversationsByProject = useWorkspaceStore((state) => state.conversationsByProject)
  const createProject = useWorkspaceStore((state) => state.createProject)
  const handleConversationCreated = useWorkspaceStore((state) => state.handleConversationCreated)
  const setConversationStatuses = useWorkspaceStore((state) => state.setConversationStatuses)
  const setMobileNavOpen = useWorkspaceStore((state) => state.setMobileNavOpen)
  const projectModalOpen = useWorkspaceStore((state) => state.projectModalOpen)
  const setProjectModalOpen = useWorkspaceStore((state) => state.setProjectModalOpen)

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
    approveTool,
    denyTool,
    stop,
    disposeConversation,
    statusByConversation,
  } = useAgentChat(active, activeConversationIds, handleConversationCreated)

  const persistedConversationStatuses = useMemo(
    () => Object.fromEntries(
      Object.values(conversationsByProject)
        .flat()
        .map((conversation) => [conversation.id, conversation.runtimeStatus ?? 'idle']),
    ) as Record<string, ConversationDisplayStatus>,
    [conversationsByProject],
  )

  const conversationStatuses = { ...persistedConversationStatuses, ...statusByConversation }
  const prevStatusesRef = useRef(conversationStatuses)
  if (prevStatusesRef.current !== conversationStatuses) {
    prevStatusesRef.current = conversationStatuses
    setConversationStatuses(conversationStatuses)
  }

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

  return (
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
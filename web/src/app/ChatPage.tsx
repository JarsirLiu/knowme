import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header, InputBar, MessageList, useAgentChat } from '@/features/chat'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUIStore } from '@/stores/ui'
import { ProjectModal } from '@/components/ProjectModal/ProjectModal'
import { DirectoryPickerModal } from '@/components/DirectoryPickerModal/DirectoryPickerModal'
import styles from './ChatPage.module.css'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)

  const active = useWorkspaceStore((state) => state.active)
  const conversationsByProject = useWorkspaceStore((state) => state.conversationsByProject)
  const createProject = useWorkspaceStore((state) => state.createProject)
  const handleConversationCreated = useWorkspaceStore((state) => state.handleConversationCreated)
  const projectModalOpen = useUIStore((state) => state.projectModalOpen)
  const setProjectModalOpen = useUIStore((state) => state.setProjectModalOpen)
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen)
  const setConversationRuntimeStatuses = useUIStore((state) => state.setConversationRuntimeStatuses)

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
  } = useAgentChat(active, activeConversationIds, handleConversationCreated)

  useEffect(() => {
    setConversationRuntimeStatuses(statusByConversation)
  }, [statusByConversation, setConversationRuntimeStatuses])

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
    if (!active) {
      setProjectModalOpen(true)
      return
    }
    if (text === '/compact') {
      setInput('')
      void compactContext()
      return
    }
    setInput('')
    void sendMessage(text)
  }, [active, input, sendMessage, compactContext])

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
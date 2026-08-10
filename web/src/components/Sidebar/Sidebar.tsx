import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquarePlus } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ActiveConversation } from '@/stores/workspace'
import { useUIStore } from '@/stores/ui'
import styles from './Sidebar.module.css'

type ProjectPopoverPosition = {
  top: number
  left: number
}

function activeConversationId(active: ActiveConversation | null): string | undefined {
  return active?.kind === 'persisted' ? active.conversationId : undefined
}

export interface SidebarProps {
  /** Desktop width in pixels. Mobile: ignored (overlay). */
  width?: number
}

export function Sidebar({ width }: SidebarProps) {
  const navigate = useNavigate()
  const projects = useWorkspaceStore((state) => state.projects)
  const conversationsByProject = useWorkspaceStore((state) => state.conversationsByProject)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const active = useWorkspaceStore((state) => state.active)
  const selectProject = useWorkspaceStore((state) => state.selectProject)
  const selectConversation = useWorkspaceStore((state) => state.selectConversation)
  const deleteConversation = useWorkspaceStore((state) => state.deleteConversation)
  const newConversation = useWorkspaceStore((state) => state.newConversation)
  const mobileOpen = useUIStore((state) => state.mobileNavOpen)
  const deletingConversationId = useUIStore((state) => state.deletingConversationId)
  const conversationRuntimeStatuses = useUIStore((state) => state.conversationRuntimeStatuses)
  const setProjectModalOpen = useUIStore((state) => state.setProjectModalOpen)
  const setDeletingConversationId = useUIStore((state) => state.setDeletingConversationId)
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen)

  const selectedConversationId = activeConversationId(active)
  const sidebarRef = useRef<HTMLElement>(null)
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<ProjectPopoverPosition | null>(null)
  const hidePopoverTimer = useRef<number | undefined>(undefined)

  const cancelHidePopover = () => {
    if (hidePopoverTimer.current !== undefined) {
      window.clearTimeout(hidePopoverTimer.current)
      hidePopoverTimer.current = undefined
    }
  }

  const showProjectPopover = (projectId: string, element: HTMLElement) => {
    cancelHidePopover()
    const rect = element.getBoundingClientRect()
    const sidebarRect = sidebarRef.current?.getBoundingClientRect()
    setHoveredProjectId(projectId)
    setPopoverPosition({
      top: Math.max(12, Math.min(rect.top, window.innerHeight - 250)),
      left: (sidebarRect?.right ?? rect.right) + 8,
    })
  }

  const scheduleHidePopover = () => {
    cancelHidePopover()
    hidePopoverTimer.current = window.setTimeout(() => {
      setHoveredProjectId(null)
      setPopoverPosition(null)
    }, 120)
  }

  const getStatus = useCallback((conversationId: string) => {
    const runtimeStatus = conversationRuntimeStatuses[conversationId]
    if (runtimeStatus) return runtimeStatus
    for (const conversations of Object.values(conversationsByProject)) {
      const conversation = conversations.find((c) => c.id === conversationId)
      if (conversation) return conversation.runtimeStatus ?? 'idle'
    }
    return 'idle'
  }, [conversationRuntimeStatuses, conversationsByProject])

  const handleSelectProject = useCallback((projectId: string) => {
    selectProject(projectId)
    setMobileNavOpen(false)
  }, [selectProject, setMobileNavOpen])

  const handleSelectConversation = useCallback((conversationId: string, projectId: string) => {
    selectConversation(conversationId, projectId)
    navigate(`/chat/${conversationId}`)
    setMobileNavOpen(false)
  }, [selectConversation, navigate, setMobileNavOpen])

  const handleNewConversation = useCallback((projectId: string) => {
    newConversation(projectId)
    navigate('/chat')
    setMobileNavOpen(false)
  }, [newConversation, navigate, setMobileNavOpen])

  const handleDelete = useCallback((conversationId: string, projectId: string, title: string) => {
    if (deletingConversationId) return
    if (!window.confirm(`删除会话"${title}"？`)) return
    setDeletingConversationId(conversationId)
    deleteConversation(conversationId, projectId).finally(() => {
      setDeletingConversationId(null)
    })
  }, [deletingConversationId, deleteConversation, setDeletingConversationId])

  const hoveredProject = projects.find((project) => project.id === hoveredProjectId)
  const hoveredConversations = hoveredProject ? conversationsByProject[hoveredProject.id] ?? [] : []
  const activeConversationCount = hoveredConversations.filter((conversation) => conversation.status === 'active').length

  return (
    <aside
      ref={sidebarRef}
      className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}
      style={width != null ? { width } : undefined}
      role="complementary"
    >
      <div className={styles.brandRow}>
        <div className={styles.brandName}>SuperAgent</div>
        <svg className={styles.brandChevron} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <button className={styles.newButton} type="button" onClick={() => handleNewConversation(activeProjectId)} disabled={!activeProjectId}>
        <MessageSquarePlus className={styles.newIcon} size={18} aria-hidden="true" />
        <span>新对话</span>
      </button>

      <div className={styles.sectionHeader}>
        <span>项目</span>
        <button className={styles.addProjectButton} type="button" onClick={() => setProjectModalOpen(true)} title="新建项目" aria-label="新建项目">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.projectList}>
      {projects.map((project) => {
      const conversations = conversationsByProject[project.id] ?? []
          return (
            <section
              key={project.id}
              className={styles.projectSection}
              onMouseEnter={(event) => showProjectPopover(project.id, event.currentTarget.querySelector(`.${styles.projectButton}`) as HTMLElement)}
              onMouseLeave={scheduleHidePopover}
            >
              <div className={styles.projectRow}>
                <button
                  type="button"
                  className={styles.projectButton}
                  onClick={() => handleSelectProject(project.id)}
                  title={project.rootPath}
                >
                  <svg className={styles.projectIcon} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
                  </svg>
                  <span className={styles.projectName}>{project.name}</span>
                </button>
                <button
                  className={styles.projectNewButton}
                  type="button"
                  onClick={() => handleNewConversation(project.id)}
                  title={`在 ${project.name} 中新建会话`}
                  aria-label={`在 ${project.name} 中新建会话`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>

              <div className={styles.conversationList}>
                {conversations.map((conversation) => {
                  const selected = conversation.id === selectedConversationId
                  const deleting = conversation.id === deletingConversationId
                  return (
                    <div
                      key={conversation.id}
                      className={`${styles.conversationItem} ${selected ? styles.conversationItemActive : ''}`}
                    >
                      <button
                        type="button"
                        className={styles.conversationButton}
                        onClick={() => handleSelectConversation(conversation.id, project.id)}
                        title={conversation.title}
                      >
                        <span className={`${styles.statusDot} ${['queued', 'running', 'waiting_approval'].includes(getStatus(conversation.id)) ? styles.statusDotBusy : ''}`} />
                        <span className={styles.conversationTitle}>
                          <span>{conversation.title}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.conversationDeleteButton}
                        onClick={() => handleDelete(conversation.id, project.id, conversation.title)}
                        disabled={deletingConversationId !== null}
                        title="删除会话"
                        aria-label={`删除会话：${conversation.title}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v5M14 11v5" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {hoveredProject && popoverPosition && (
        <div
          className={styles.projectPopover}
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          onMouseEnter={cancelHidePopover}
          onMouseLeave={scheduleHidePopover}
        >
          <div className={styles.popoverHeader}>
            <svg className={styles.popoverFolderIcon} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
            </svg>
            <strong>{hoveredProject.name}</strong>
            <button
              className={styles.popoverNewButton}
              type="button"
              onClick={() => handleNewConversation(hoveredProject.id)}
              title="新建会话"
              aria-label="新建会话"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          <div className={styles.popoverRow}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span>{activeConversationCount} 个活跃会话</span>
          </div>
          <div className={styles.popoverRow}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
            </svg>
            <span className={styles.popoverPath} title={hoveredProject.rootPath}>{hoveredProject.rootPath}</span>
          </div>
        </div>
      )}
    </aside>
  )
}

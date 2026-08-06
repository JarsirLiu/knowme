import { useRef, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ActiveConversation } from '@/stores/workspace'
import styles from './Sidebar.module.css'

type ProjectPopoverPosition = {
  top: number
  left: number
}

function activeConversationId(active: ActiveConversation | null): string | undefined {
  return active?.kind === 'persisted' ? active.conversationId : undefined
}

export function Sidebar() {
  const projects = useWorkspaceStore((state) => state.projects)
  const conversationsByProject = useWorkspaceStore((state) => state.conversationsByProject)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const active = useWorkspaceStore((state) => state.active)
  const conversationStatuses = useWorkspaceStore((state) => state.conversationStatuses)
  const mobileOpen = useWorkspaceStore((state) => state.mobileNavOpen)
  const deletingConversationId = useWorkspaceStore((state) => state.deletingConversationId)
  const selectProject = useWorkspaceStore((state) => state.selectProject)
  const selectConversation = useWorkspaceStore((state) => state.selectConversation)
  const deleteConversation = useWorkspaceStore((state) => state.deleteConversation)
  const newConversation = useWorkspaceStore((state) => state.newConversation)
  const setProjectModalOpen = useWorkspaceStore((state) => state.setProjectModalOpen)

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

  const hoveredProject = projects.find((project) => project.id === hoveredProjectId)
  const hoveredConversations = hoveredProject ? conversationsByProject[hoveredProject.id] ?? [] : []
  const activeConversationCount = hoveredConversations.filter((conversation) => conversation.status === 'active').length

  return (
    <aside ref={sidebarRef} className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.brandRow}>
        <div className={styles.brandName}>SuperAgent</div>
        <svg className={styles.brandChevron} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <button className={styles.newButton} type="button" onClick={() => newConversation(activeProjectId)} disabled={!activeProjectId}>
        <svg className={styles.newIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.5 5.5H6A2 2 0 0 0 4 7.5v10A2 2 0 0 0 6 19.5h10a2 2 0 0 0 2-2V10" />
          <path d="m14 4 6 6M12 14l1.5-4.5L18 8l2 2-1.5 4.5L14 16l-2-2Z" />
        </svg>
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
                  onClick={() => selectProject(project.id)}
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
                    onClick={() => newConversation(project.id)}
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
                          onClick={() => selectConversation(conversation.id, project.id)}
                        title={conversation.title}
                      >
                         <span className={`${styles.statusDot} ${conversationStatuses[conversation.id] === 'queued' || conversationStatuses[conversation.id] === 'running' || conversationStatuses[conversation.id] === 'waiting_approval' ? styles.statusDotBusy : ''}`} />
                        <span className={styles.conversationTitle}>{conversation.title}</span>
                      </button>
<button
                          type="button"
                          className={styles.conversationDeleteButton}
                          onClick={() => void deleteConversation(conversation.id, project.id)}
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
              onClick={() => newConversation(hoveredProject.id)}
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

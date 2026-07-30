import styles from './Sidebar.module.css'

interface SessionItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface ProjectGroup {
  name: string
  sessions: SessionItem[]
}

type SidebarProps = {
  projects: ProjectGroup[]
  sessions: SessionItem[]
  currentId: string
  isLoading: boolean
  onSelect: (id: string) => void
  onNew: () => void
}

export function Sidebar({ projects, sessions, currentId, isLoading, onSelect, onNew }: SidebarProps) {
  const renderFolder = (project: ProjectGroup) => (
    <div key={project.name} className={styles.folderGroup}>
      <button className={styles.folderItem} type="button">
        <span className={styles.folderText}>{project.name}</span>
      </button>
      {project.sessions.map((session) => {
        const isActive = session.id === currentId
        return (
          <button
            key={session.id}
            className={`${styles.taskItem} ${isActive ? styles.taskItemActive : ''} ${isActive && isLoading ? styles.taskItemLoading : ''}`}
            type="button"
            onClick={() => onSelect(session.id)}
            title={session.title}
          >
            <span>{session.title}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brandRow}>
        <span className={styles.brandName}>SuperAgent</span>
      </div>

      <div className={styles.searchRow}>
        <button className={styles.searchButton} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      <div className={styles.sectionLabel}>项目</div>

      <div className={styles.projectsList}>
        {projects.length === 0 && sessions.length === 0 ? (
          <div className={styles.emptyState}>暂无对话</div>
        ) : (
          <>
            {projects.map(renderFolder)}
            {sessions
              .filter((s) => !projects.some((p) => p.sessions.some((ps) => ps.id === s.id)))
              .map((session) => {
                const isActive = session.id === currentId
                return (
                  <button
                    key={session.id}
                    className={`${styles.taskItem} ${isActive ? styles.taskItemActive : ''} ${isActive && isLoading ? styles.taskItemLoading : ''}`}
                    type="button"
                    onClick={() => onSelect(session.id)}
                    title={session.title}
                  >
                    <span>{session.title}</span>
                  </button>
                )
              })}
          </>
        )}
      </div>

      <div className={styles.sidebarBottom}>
        <button className={styles.sidebarBottomLink} type="button" onClick={onNew}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>新建</span>
        </button>
      </div>
    </aside>
  )
}

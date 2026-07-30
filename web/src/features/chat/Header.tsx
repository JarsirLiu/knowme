import styles from './Header.module.css'

type HeaderProps = {
  title: string
  onNew: () => void
}

export function Header({ title, onNew }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.folderIcon}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className={styles.headerTitle}>{title}</span>
      </div>
      <div className={styles.headerRight}>
        <button className={styles.headerButton} type="button" onClick={onNew} title="新建对话">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  )
}

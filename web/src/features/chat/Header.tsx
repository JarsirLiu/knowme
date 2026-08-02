import styles from './Header.module.css'

type HeaderProps = {
  title: string
  onOpenNavigation?: () => void
}

export function Header({ title, onOpenNavigation }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {onOpenNavigation && (
          <button className={styles.menuButton} type="button" onClick={onOpenNavigation} aria-label="打开项目导航">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        )}
        <span className={styles.folderIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
          </svg>
        </span>
        <span className={styles.headerTitle}>{title}</span>
      </div>
      <div className={styles.headerRight} />
    </header>
  )
}

import styles from './Header.module.css'

type HeaderProps = {
  title: string
  description?: string
  onNew: () => void
}

export function Header({ title, description, onNew }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <h1 className={styles.headerTitle}>{title}</h1>
        {description && <span className={styles.headerBadge}>{description}</span>}
      </div>
      <div className={styles.headerRight}>
        <button className={styles.headerButton} type="button" onClick={onNew}>
          新对话
        </button>
      </div>
    </header>
  )
}
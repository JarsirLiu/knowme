import styles from './ThinkingState.module.css'

export function ThinkingState() {
  return (
    <span className={styles.shimmer} role="status" aria-live="polite" aria-label="Thinking">
      Thinking
    </span>
  )
}

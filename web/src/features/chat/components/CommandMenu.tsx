import { useEffect, useRef } from 'react'
import type { CmdItem } from '../commands'
import styles from '../InputBar.module.css'

type CommandMenuProps = {
  commands: CmdItem[]
  show: boolean
  selectedIndex: number
  onSelect: (cmd: CmdItem) => void
  onClose: () => void
  onSelectedIndexChange: (index: number) => void
}

export function CommandMenu({
  commands,
  show,
  selectedIndex,
  onSelect,
  onClose,
  onSelectedIndexChange,
}: CommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [show, onClose])

  if (!show || commands.length === 0) return null

  return (
    <div className={styles.commandMenu} ref={menuRef}>
      {commands.map((cmd, i) => (
        <button
          key={cmd.label}
          className={`${styles.commandItem} ${i === selectedIndex ? styles.commandItemActive : ''}`}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
          onMouseEnter={() => onSelectedIndexChange(i)}
        >
          <span className={cmd.type === 'system' ? styles.commandLabelSystem : styles.commandLabelSkill}>
            {cmd.label}
          </span>
          <span className={styles.commandDesc}>{cmd.description}</span>
        </button>
      ))}
    </div>
  )
}
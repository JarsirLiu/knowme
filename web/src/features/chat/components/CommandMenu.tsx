import { useEffect, useMemo, useRef } from 'react'
import type { CmdItem } from '../commands'
import { GROUP_LABELS } from '../commands'
import styles from '../InputBar.module.css'

type RenderItem =
  | { kind: 'header'; label: string }
  | { kind: 'command'; cmd: CmdItem; index: number }

function buildRenderItems(commands: CmdItem[]): RenderItem[] {
  const items: RenderItem[] = []
  let lastGroup: string | undefined
  let commandIndex = 0
  for (const cmd of commands) {
    if (cmd.group !== lastGroup) {
      items.push({ kind: 'header', label: GROUP_LABELS[cmd.group] })
      lastGroup = cmd.group
    }
    items.push({ kind: 'command', cmd, index: commandIndex++ })
  }
  return items
}

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

  const renderItems = useMemo(() => buildRenderItems(commands), [commands])

  if (!show || commands.length === 0) return null

  return (
    <div className={styles.commandMenu} ref={menuRef}>
      {renderItems.map((item) =>
        item.kind === 'header' ? (
          <div key={item.label} className={styles.commandGroupHeader}>{item.label}</div>
        ) : (
          <button
            key={item.cmd.label}
            className={`${styles.commandItem} ${item.index === selectedIndex ? styles.commandItemActive : ''}`}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(item.cmd) }}
            onMouseEnter={() => onSelectedIndexChange(item.index)}
          >
            <span className={item.cmd.type === 'system' ? styles.commandLabelSystem : styles.commandLabelSkill}>
              {item.cmd.label}
            </span>
            <span className={styles.commandDesc}>{item.cmd.description}</span>
          </button>
        ),
      )}
    </div>
  )
}
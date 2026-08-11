import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUIStore } from '@/stores/ui'
import styles from './Layout.module.css'

const STORAGE_KEY = 'cloudagent_sidebar_width'
const MOBILE_BREAK = 760
const DEFAULT_WIDTH = 260
const MIN_WIDTH = 220
const MAX_WIDTH = 480
const HANDLE_WIDTH = 5

function readStoredWidth(): number {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const px = Number(saved)
    if (Number.isFinite(px) && px > 0) {
      return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, px))
    }
  }
  return DEFAULT_WIDTH
}

export default function Layout() {
  const initialized = useWorkspaceStore((state) => state.initialized)
  const mobileNavOpen = useUIStore((state) => state.mobileNavOpen)
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen)
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace)

  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAK)
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAK)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Stop dragging when mouse leaves the window
  useEffect(() => {
    const stop = () => setIsDragging(false)
    window.addEventListener('mouseup', stop)
    window.addEventListener('mouseleave', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('mouseleave', stop)
      window.removeEventListener('blur', stop)
    }
  }, [])

  // Apply cursor when dragging
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'col-resize'
      document.body.classList.add('dragging')
    } else {
      document.body.style.cursor = ''
      document.body.classList.remove('dragging')
    }
    return () => {
      document.body.style.cursor = ''
      document.body.classList.remove('dragging')
    }
  }, [isDragging])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [isMobile])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const newWidth = e.clientX
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    setSidebarWidth(clamped)
    localStorage.setItem(STORAGE_KEY, String(clamped))
  }, [isDragging])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isDragging, handleMouseMove])

  if (!initialized) {
    return <div className={styles.loadingScreen}>正在加载本地工作区…</div>
  }

  if (isMobile) {
    return (
      <div className={styles.appLayout}>
        {mobileNavOpen && (
          <button
            className={styles.mobileBackdrop}
            type="button"
            aria-label="关闭项目导航"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <Sidebar width={280} />
        <div className={styles.mainArea}>
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.appLayout}>
      <div className={styles.sidebarWrapper} style={{ width: sidebarWidth }}>
        <Sidebar width={sidebarWidth} />
        <div
          className={styles.resizeHandle}
          style={{ width: HANDLE_WIDTH }}
          onMouseDown={handleMouseDown}
          title="拖拽调整侧边栏宽度"
        />
      </div>
      <div className={styles.mainArea}>
        <Outlet />
      </div>
    </div>
  )
}

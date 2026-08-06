import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import styles from './Layout.module.css'

export default function Layout() {
  const initialized = useWorkspaceStore((state) => state.initialized)
  const mobileNavOpen = useWorkspaceStore((state) => state.mobileNavOpen)
  const setMobileNavOpen = useWorkspaceStore((state) => state.setMobileNavOpen)
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace)

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  if (!initialized) {
    return <div className={styles.loadingScreen}>正在加载本地工作区…</div>
  }

  return (
    <div className={styles.appLayout}>
      {mobileNavOpen && (
        <button className={styles.mobileBackdrop} type="button" aria-label="关闭项目导航" onClick={() => setMobileNavOpen(false)} />
      )}
      <Sidebar />
      <Outlet />
    </div>
  )
}
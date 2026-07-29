import {
  IconSearch,
  IconSettings,
  IconNewTask,
  IconClock,
  IconPlug,
} from "@/components/Icons";

import styles from "./Sidebar.module.css";

/* ---- Icons (inline) ---- */

function IconBrand({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

/* ---- Session types ---- */

interface SessionItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/* ---- Sidebar ---- */

type SidebarProps = {
  sessions: SessionItem[];
  currentId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function Sidebar({ sessions, currentId, onSelect, onNew }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brandRow}>
        <div className={styles.brandIcon}>
          <IconBrand size={16} />
        </div>
        <span>SuperAgent</span>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <span className={styles.searchIcon}>
          <IconSearch size={14} />
        </span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="搜索"
          readOnly
        />
      </div>

      {/* Menu */}
      <div className={styles.menuSection}>
        <button className={styles.menuItem} type="button" onClick={onNew}>
          <span className={styles.menuIcon}><IconNewTask size={16} /></span>
          新建任务
        </button>
        <button className={styles.menuItem} type="button">
          <span className={styles.menuIcon}><IconClock size={16} /></span>
          已安排
        </button>
        <button className={styles.menuItem} type="button">
          <span className={styles.menuIcon}><IconPlug size={16} /></span>
          插件
        </button>
      </div>

      {/* Section label */}
      <div className={styles.sectionLabel}>项目</div>

      {/* Sessions list */}
      <div className={styles.projectsList}>
        {sessions.length === 0 ? (
          <div style={{ padding: "16px 8px", fontSize: 13, color: "var(--color-faint)", textAlign: "center" }}>
            暂无对话
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === currentId;
            return (
              <button
                key={session.id}
                className={[
                  styles.taskItem,
                  isActive && styles.taskItemActive,
                ].filter(Boolean).join(" ")}
                type="button"
                onClick={() => onSelect(session.id)}
                title={session.title}
              >
                <span className={styles.taskItemText}>{session.title}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom */}
      <div className={styles.sidebarBottom}>
        <button className={styles.sidebarBottomLink} type="button">
          <IconSettings size={14} />
          <span>custom</span>
        </button>
        <span style={{ fontSize: 11, color: "var(--color-faint)" }}>v0.1.0</span>
      </div>
    </aside>
  );
}

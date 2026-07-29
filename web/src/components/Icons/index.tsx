/**
 * Icon library — shared SVG icons used across the app.
 * All icons follow the same convention: size (default 16), color (default currentColor), style.
 */

import type { IconProps } from "./types";

/**
 * Generic SVG icon wrapper for any inline path.
 * Usage: `<Icon><path .../></Icon>`
 */
export function Icon({ size = 16, color, strokeWidth = 2, children, style }: IconProps & { children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

/* ---------- Named icons ---------- */

export function IconSearch({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Icon>;
}

export function IconPlus({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
}

export function IconSend({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Icon>;
}

export function IconStop({ size = 16, color, style }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color || "currentColor"} style={style}><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>;
}

export function IconTerminal({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></Icon>;
}

export function IconFile({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>;
}

export function IconFileEdit({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>;
}

export function IconTool({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></Icon>;
}

export function IconSparkles({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></Icon>;
}

export function IconFolder({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></Icon>;
}

export function IconChevronDown({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><polyline points="6 9 12 15 18 9"/></Icon>;
}

export function IconChevronRight({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><polyline points="9 18 15 12 9 6"/></Icon>;
}

export function IconMessageSquare({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Icon>;
}

export function IconSettings({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2h0a2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2h0a2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>;
}

export function IconNewTask({ size = 16, color, style}: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>;
}

export function IconBranch({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></Icon>;
}

export function IconClock({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>;
}

export function IconPlug({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><path d="M12 2v4"/><path d="M12 22v-4"/><path d="M5 12H1"/><path d="M23 12h-4"/><circle cx="12" cy="12" r="3"/></Icon>;
}

export function IconExpand({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></Icon>;
}

export function IconList({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></Icon>;
}

export function IconGrid({ size = 16, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>;
}

export function IconDots({ size = 16, color, style }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color || "currentColor"} style={style}><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>;
}

export function IconCheck({ size = 14, color, style}: IconProps) {
  return <Icon size={size} color={color} style={style} strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></Icon>;
}

export function IconX({ size = 14, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style} strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>;
}

export function IconBot({ size = 20, color, style }: IconProps) {
  return <Icon size={size} color={color} style={style}><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></Icon>;
}

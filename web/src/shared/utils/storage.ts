/** 安全的 localStorage 读写（避免 SSR、禁用存储时的崩溃） */

export function getItem<T>(key: string, fallback?: T): T | null {
  if (typeof window === "undefined") return fallback ?? null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback ?? null;
    return JSON.parse(raw) as T;
  } catch {
    return fallback ?? null;
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — silently ignore
  }
}

export function removeItem(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

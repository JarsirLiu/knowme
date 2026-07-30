export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getItem<T>(key: string, fallback?: T): T | null {
  if (typeof window === 'undefined') return fallback ?? null
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback ?? null
    return JSON.parse(raw) as T
  } catch {
    return fallback ?? null
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full
  }
}
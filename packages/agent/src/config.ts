export interface AppConfig {
  baseURL: string
  apiKey: string
  model: string
  workspace: string
  modelTimeoutMs: number
}

function getRequired(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  throw new Error(
    `Missing required config (${names.join(' / ')}). Set in .env at project root.`,
  )
}

function getPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export function loadConfig(): AppConfig {
  const baseURL = getRequired('CLOUDAGENT_BASE_URL', 'OPENAI_BASE_URL')
  const apiKey = getRequired('CLOUDAGENT_API_KEY', 'OPENAI_API_KEY')
  const model = getRequired('CLOUDAGENT_MODEL', 'OPENAI_MODEL')
  const workspace =
    process.env.CLOUDAGENT_WORKSPACE || process.env.WORKSPACE || process.cwd()
  const modelTimeoutMs = getPositiveInteger('CLOUDAGENT_MODEL_TIMEOUT_MS', 120_000)
  return { baseURL, apiKey, model, workspace, modelTimeoutMs }
}

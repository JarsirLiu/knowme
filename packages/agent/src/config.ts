export interface AppConfig {
  baseURL: string
  apiKey: string
  model: string
  workspace: string
  autoApproveShell: boolean
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

export function loadConfig(): AppConfig {
  const baseURL = getRequired('SUPERAGENT_BASE_URL', 'OPENAI_BASE_URL')
  const apiKey = getRequired('SUPERAGENT_API_KEY', 'OPENAI_API_KEY')
  const model = getRequired('SUPERAGENT_MODEL', 'OPENAI_MODEL')
  const workspace =
    process.env.SUPERAGENT_WORKSPACE || process.env.WORKSPACE || process.cwd()
  const autoApproveShell =
    (process.env.SUPERAGENT_AUTO_APPROVE_SHELL || 'false').toLowerCase() === 'true'
  return { baseURL, apiKey, model, workspace, autoApproveShell }
}

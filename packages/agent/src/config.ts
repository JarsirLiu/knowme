import type { ContextCompactionOptions } from './context-compaction/types.js'

export interface AppConfig {
  baseURL: string
  apiKey: string
  model: string
  workspace: string
  modelTimeoutMs: number
  contextCompaction: ContextCompactionOptions
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
  return {
    baseURL,
    apiKey,
    model,
    workspace,
    modelTimeoutMs,
    contextCompaction: {
      enabled: getBoolean('CLOUDAGENT_CONTEXT_PROXY_ENABLED', true),
      contextWindowTokens: getPositiveInteger('CLOUDAGENT_CONTEXT_WINDOW_TOKENS', 256_000),
      outputReserveTokens: getPositiveInteger('CLOUDAGENT_CONTEXT_OUTPUT_RESERVE_TOKENS', 16_000),
      safetyMarginTokens: getPositiveInteger('CLOUDAGENT_CONTEXT_SAFETY_MARGIN_TOKENS', 1_024),
      triggerRatio: getRatio('CLOUDAGENT_CONTEXT_COMPACT_TRIGGER_RATIO', 0.9),
      keepRecentTokens: getPositiveInteger('CLOUDAGENT_CONTEXT_COMPACT_KEEP_TOKENS', 20_000),
      maxPromptChars: getPositiveInteger('CLOUDAGENT_CONTEXT_COMPACT_MAX_CHARS', 50_000),
      summaryModel: process.env.CLOUDAGENT_CONTEXT_COMPACT_MODEL?.trim() || model,
      summaryMaxOutputTokens: getPositiveInteger('CLOUDAGENT_CONTEXT_COMPACT_MAX_TOKENS', 1_200),
    },
  }
}

function getBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (!value?.trim()) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getRatio(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback
}

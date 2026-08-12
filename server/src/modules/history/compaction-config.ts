import { loadConfig, getInstructions } from '@cloudagent/agent'
import {
  OpenAICompatibleContextSummarizer,
  type ContextSummarizer,
} from './context-summarizer.js'
import { type CompactionPolicyOptions } from './compaction-policy.js'
import { estimateTokens } from './token-estimator.js'

export interface SessionCompactionOptions extends CompactionPolicyOptions {
  summarizer: ContextSummarizer
}

export function loadSessionCompactionOptions(): SessionCompactionOptions {
  const cfg = loadConfig()
  return {
    enabled: readBooleanEnv('CLOUDAGENT_CONTEXT_AUTO_COMPACT', true),
    contextWindowTokens: readNumberEnv('CLOUDAGENT_CONTEXT_WINDOW_TOKENS', 256000),
    outputReserveTokens: readNumberEnv('CLOUDAGENT_CONTEXT_OUTPUT_RESERVE_TOKENS', 16000),
    safetyMarginTokens: readNumberEnv('CLOUDAGENT_CONTEXT_SAFETY_MARGIN_TOKENS', 1024),
    triggerRatio: readRatioEnv('CLOUDAGENT_CONTEXT_COMPACT_TRIGGER_RATIO', 0.9),
    keepRecentTokens: readNumberEnv('CLOUDAGENT_CONTEXT_COMPACT_KEEP_TOKENS', 20000),
    maxPromptChars: readNumberEnv('CLOUDAGENT_CONTEXT_COMPACT_MAX_CHARS', 50000),
    baseTokens: readNumberEnv('CLOUDAGENT_CONTEXT_BASE_TOKENS', 0) || computeBaseTokens(),
    forceCompactRatio: readRatioEnv('CLOUDAGENT_CONTEXT_FORCE_COMPACT_RATIO', 0.95),
    summarizer: new OpenAICompatibleContextSummarizer({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      maxOutputTokens: readNumberEnv('CLOUDAGENT_CONTEXT_COMPACT_MAX_TOKENS', 1200),
    }),
  }
}

function computeBaseTokens(): number {
  const instructionsTokens = estimateTokens(getInstructions('main'))
  const toolTokens = readNumberEnv('CLOUDAGENT_CONTEXT_TOOL_TOKENS', 2000)
  return instructionsTokens + toolTokens
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readNumberEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : defaultValue
}

function readRatioEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : defaultValue
}

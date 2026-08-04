import { loadConfig } from '@superagent/agent'
import {
  OpenAICompatibleContextSummarizer,
  type ContextSummarizer,
} from './context-summarizer.js'
import type { CompactionPolicyOptions } from './compaction-policy.js'

export interface SessionCompactionOptions extends CompactionPolicyOptions {
  summarizer: ContextSummarizer
}

export function loadSessionCompactionOptions(): SessionCompactionOptions {
  const cfg = loadConfig()
  return {
    enabled: readBooleanEnv('SUPERAGENT_CONTEXT_AUTO_COMPACT', true),
    contextWindowTokens: readNumberEnv('SUPERAGENT_CONTEXT_WINDOW_TOKENS', 64000),
    outputReserveTokens: readNumberEnv('SUPERAGENT_CONTEXT_OUTPUT_RESERVE_TOKENS', 16000),
    safetyMarginTokens: readNumberEnv('SUPERAGENT_CONTEXT_SAFETY_MARGIN_TOKENS', 1024),
    triggerRatio: readRatioEnv('SUPERAGENT_CONTEXT_COMPACT_TRIGGER_RATIO', 0.9),
    keepRecentTokens: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_KEEP_TOKENS', 20000),
    maxPromptChars: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_MAX_CHARS', 50000),
    summarizer: new OpenAICompatibleContextSummarizer({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      maxOutputTokens: readNumberEnv('SUPERAGENT_CONTEXT_COMPACT_MAX_TOKENS', 1200),
    }),
  }
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

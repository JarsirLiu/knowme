import { stringify } from './json.js'

// Byte-level token approximation aligned with Codex (`APPROX_BYTES_PER_TOKEN = 4`):
// UTF-8 bytes / 4, rounded up. Cheaper than a real BPE tokenizer and close enough
// for compaction budget decisions. Real API usage is still used to calibrate
// predictions in `session-compaction.ts`.
const APPROX_BYTES_PER_TOKEN = 4

export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : stringify(value)
  const bytes = Buffer.byteLength(text, 'utf8')
  return Math.max(1, Math.ceil((bytes + APPROX_BYTES_PER_TOKEN - 1) / APPROX_BYTES_PER_TOKEN))
}

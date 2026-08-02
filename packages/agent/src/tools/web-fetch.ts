import { tool } from '@openai/agents'
import { z } from 'zod'

const DEFAULT_MAX_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 20_000

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost'
    || host === '::1'
    || host.startsWith('127.')
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export const webFetch = () =>
  tool({
    name: 'web_fetch',
    description: 'Fetch a public web page and return readable text. Use for documentation and research.',
    parameters: z.object({
      url: z.string().url().describe('Public HTTP or HTTPS URL'),
      max_bytes: z.coerce.number().int().min(1_000).max(5_000_000).nullable().optional(),
      timeout_ms: z.coerce.number().int().min(1_000).max(60_000).nullable().optional(),
    }),
    execute: async ({ url, max_bytes, timeout_ms }) => {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported')
      }
      if (isPrivateHost(parsed.hostname)) {
        throw new Error('Private and localhost URLs are blocked')
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeout_ms ?? DEFAULT_TIMEOUT_MS)
      try {
        const response = await fetch(parsed, {
          signal: controller.signal,
          headers: { 'user-agent': 'SuperAgent/0.1 web_fetch' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)

        const contentLength = Number(response.headers.get('content-length') || 0)
        const maxBytes = max_bytes ?? DEFAULT_MAX_BYTES
        if (contentLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`)

        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`)
        const raw = buffer.toString('utf8')
        const contentType = response.headers.get('content-type') || ''
        const text = contentType.includes('html') ? stripHtml(raw) : raw

        return JSON.stringify({
          url: response.url,
          contentType,
          status: response.status,
          text,
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  })

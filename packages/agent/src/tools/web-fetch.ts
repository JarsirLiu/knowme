import { tool } from '@openai/agents'
import { Readability } from '@mozilla/readability'
import sniffHTMLEncoding from 'html-encoding-sniffer'
import iconv from 'iconv-lite'
import { JSDOM } from 'jsdom'
import { z } from 'zod'

const DEFAULT_MAX_BYTES = 1024 * 1024
const MAX_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 60_000
const MAX_TEXT_CHARS = 60_000

const REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.8,*/*;q=0.6',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 SuperAgent/0.1',
}

type RawNumber = number | string | null | undefined

type WebFetchOk = {
  ok: true
  url: string
  finalUrl: string
  status: number
  contentType: string
  encoding: string
  bytes: number
  title: string | null
  excerpt: string | null
  text: string
  truncated: boolean
}

type WebFetchError = {
  ok: false
  url: string
  finalUrl?: string
  status?: number
  contentType?: string
  error: string
}

function clampInteger(value: RawNumber, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost'
    || host === '::1'
    || host === '0.0.0.0'
    || host.endsWith('.local')
    || host.startsWith('127.')
    || host.startsWith('10.')
    || host.startsWith('169.254.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || /^f[cd][0-9a-f]{2}:/i.test(host)
    || /^fe80:/i.test(host)
}

function parseUrl(input: string): URL | WebFetchError {
  try {
    const parsed = new URL(input)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, url: input, error: 'Only HTTP and HTTPS URLs are supported.' }
    }
    if (isPrivateHost(parsed.hostname)) {
      return { ok: false, url: input, error: 'Private, localhost, and link-local URLs are blocked.' }
    }
    return parsed
  } catch {
    return { ok: false, url: input, error: 'Invalid URL.' }
  }
}

function getCharsetFromContentType(contentType: string): string | undefined {
  const match = /charset\s*=\s*['"]?([^\s;'"()<>]+)/i.exec(contentType)
  return match?.[1]
}

function isHtmlContent(contentType: string, buffer: Buffer): boolean {
  const lower = contentType.toLowerCase()
  if (lower.includes('text/html') || lower.includes('application/xhtml+xml')) return true
  if (lower) return false
  return buffer.subarray(0, 1024).toString('ascii').toLowerCase().includes('<html')
}

function isTextLikeContent(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return lower.startsWith('text/')
    || lower.includes('json')
    || lower.includes('xml')
    || lower.includes('javascript')
    || lower.includes('x-www-form-urlencoded')
}

function decodeBuffer(buffer: Buffer, contentType: string, html: boolean): { text: string; encoding: string } {
  const charset = getCharsetFromContentType(contentType)
  const encoding = html
    ? sniffHTMLEncoding(buffer, {
        transportLayerEncodingLabel: charset,
        defaultEncoding: 'windows-1252',
      })
    : (charset ?? 'utf-8')

  const normalized = iconv.encodingExists(encoding) ? encoding : 'utf-8'
  return { text: iconv.decode(buffer, normalized), encoding: normalized }
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function capText(input: string): { text: string; truncated: boolean } {
  const text = normalizeText(input)
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false }
  return { text: text.slice(0, MAX_TEXT_CHARS).trimEnd(), truncated: true }
}

function extractReadableText(html: string, url: string): { title: string | null; excerpt: string | null; text: string } {
  const dom = new JSDOM(html, { url })
  try {
    const article = new Readability(dom.window.document).parse()
    if (article?.textContent?.trim()) {
      return {
        title: article.title?.trim() || dom.window.document.title?.trim() || null,
        excerpt: article.excerpt?.trim() || null,
        text: article.textContent,
      }
    }

    return {
      title: dom.window.document.title?.trim() || null,
      excerpt: null,
      text: dom.window.document.body?.textContent ?? '',
    }
  } finally {
    dom.window.close()
  }
}

function asToolResult(result: WebFetchOk | WebFetchError): string {
  return JSON.stringify(result)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Request timed out.'
  if (error instanceof Error) return error.message
  return String(error)
}

export const webFetch = () =>
  tool({
    name: 'web_fetch',
    description:
      'Fetch a public web page and return readable text. Use for documentation and research. The tool returns structured JSON and does not reuse browser login state.',
    parameters: z.object({
      url: z.string().min(1).describe('Public HTTP or HTTPS URL'),
      max_bytes: z.union([z.number(), z.string()]).nullable().optional()
        .describe('Maximum response bytes, default 1048576, capped at 5242880'),
      timeout_ms: z.union([z.number(), z.string()]).nullable().optional()
        .describe('Request timeout in milliseconds, default 20000, capped at 60000'),
    }),
    execute: async ({ url, max_bytes, timeout_ms }) => {
      const parsed = parseUrl(url)
      if (!(parsed instanceof URL)) return asToolResult(parsed)

      const maxBytes = clampInteger(max_bytes, DEFAULT_MAX_BYTES, 1_000, MAX_MAX_BYTES)
      const timeoutMs = clampInteger(timeout_ms, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(parsed, {
          signal: controller.signal,
          headers: REQUEST_HEADERS,
          redirect: 'follow',
        })
        const contentType = response.headers.get('content-type') ?? ''
        const contentLength = Number(response.headers.get('content-length') ?? 0)

        if (!response.ok) {
          return asToolResult({
            ok: false,
            url: parsed.toString(),
            finalUrl: response.url,
            status: response.status,
            contentType,
            error: `HTTP ${response.status} ${response.statusText}`,
          })
        }

        if (contentLength > maxBytes) {
          return asToolResult({
            ok: false,
            url: parsed.toString(),
            finalUrl: response.url,
            status: response.status,
            contentType,
            error: `Response exceeds ${maxBytes} bytes.`,
          })
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.byteLength > maxBytes) {
          return asToolResult({
            ok: false,
            url: parsed.toString(),
            finalUrl: response.url,
            status: response.status,
            contentType,
            error: `Response exceeds ${maxBytes} bytes.`,
          })
        }

        const html = isHtmlContent(contentType, buffer)
        if (!html && contentType && !isTextLikeContent(contentType)) {
          return asToolResult({
            ok: false,
            url: parsed.toString(),
            finalUrl: response.url,
            status: response.status,
            contentType,
            error: 'Unsupported non-text content type.',
          })
        }

        const decoded = decodeBuffer(buffer, contentType, html)
        const readable = html
          ? extractReadableText(decoded.text, response.url)
          : { title: null, excerpt: null, text: decoded.text }
        const capped = capText(readable.text)

        return asToolResult({
          ok: true,
          url: parsed.toString(),
          finalUrl: response.url,
          status: response.status,
          contentType,
          encoding: decoded.encoding,
          bytes: buffer.byteLength,
          title: readable.title,
          excerpt: readable.excerpt,
          text: capped.text,
          truncated: capped.truncated,
        })
      } catch (error) {
        return asToolResult({
          ok: false,
          url: parsed.toString(),
          error: getErrorMessage(error),
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  })

import type {
  Session,
  Message,
  Device,
  SSEEvent,
  CreateSessionRequest,
  SessionResponse,
  SessionListResponse,
  MessageListResponse,
  DeviceResponse,
  DeviceListResponse,
} from '@superagent/core'
import { parseSSEStream } from './sse-parser.js'
import { SuperagentClientError } from './errors.js'

export interface SuperagentClientOptions {
  baseUrl: string
}

export class SuperagentClient {
  private baseUrl: string

  constructor(opts: SuperagentClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
  }

  // ---- Sessions ----

  async createSession(req?: CreateSessionRequest): Promise<Session> {
    const res = await this.fetch('/api/sessions', {
      method: 'POST',
      body: req ? JSON.stringify(req) : undefined,
    })
    const data = (await res.json()) as SessionResponse
    return data.session
  }

  async listSessions(): Promise<Session[]> {
    const res = await this.fetch('/api/sessions')
    const data = (await res.json()) as SessionListResponse
    return data.sessions
  }

  async getSession(id: string): Promise<Session> {
    const res = await this.fetch(`/api/sessions/${id}`)
    const data = (await res.json()) as SessionResponse
    return data.session
  }

  // ---- Messages ----

  async getMessages(sessionId: string): Promise<Message[]> {
    const res = await this.fetch(`/api/sessions/${sessionId}/messages`)
    const data = (await res.json()) as MessageListResponse
    return data.messages
  }

  // ---- Chat (SSE) ----

  async *chat(sessionId: string, message: string): AsyncGenerator<SSEEvent> {
    const res = await this.fetch(`/api/sessions/${sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message }),
    })
    yield* parseSSEStream(res)
  }

  // ---- Tool Approval ----

  async approveToolCall(sessionId: string, toolCallId: string): Promise<void> {
    await this.fetch(`/api/sessions/${sessionId}/tools/approve`, {
      method: 'POST',
      body: JSON.stringify({ toolCallId }),
    })
  }

  async denyToolCall(sessionId: string, toolCallId: string): Promise<void> {
    await this.fetch(`/api/sessions/${sessionId}/tools/deny`, {
      method: 'POST',
      body: JSON.stringify({ toolCallId }),
    })
  }

  // ---- Devices ----

  async listDevices(): Promise<Device[]> {
    const res = await this.fetch('/api/devices')
    const data = (await res.json()) as DeviceListResponse
    return data.devices
  }

  async registerDevice(req: { name: string; endpoint: string; apiKey: string }): Promise<Device> {
    const res = await this.fetch('/api/devices', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    const data = (await res.json()) as DeviceResponse
    return data.device
  }

  // ---- Internal ----

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const hasBody = init?.body !== undefined && init?.body !== null
    const res = await fetch(`${this.baseUrl}${url}`, {
      ...init,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      } as HeadersInit,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new SuperagentClientError(
        `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        res.status,
      )
    }
    return res
  }
}
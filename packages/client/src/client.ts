import type {
  Conversation,
  ConversationListResponse,
  ConversationTimelineResponse,
  DirectoryListingResponse,
  AnyTimelineEvent,
  CreateProjectRequest,
  Device,
  DeviceListResponse,
  DeviceResponse,
  Project,
  ProjectListResponse,
  ProjectResponse,
  StartTurnRequest,
  SSEEvent,
  StartTurnResult,
} from '@superagent/core'
import { parseSSEStream } from './sse-parser.js'
import { SuperagentClientError } from './errors.js'

export interface SuperagentClientOptions {
  baseUrl: string
}

export const MAX_EVENT_RECONNECT_ATTEMPTS = 8

export class SuperagentClient {
  private baseUrl: string

  constructor(opts: SuperagentClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
  }

  async listProjects(): Promise<Project[]> {
    const res = await this.fetch('/api/projects')
    const data = (await res.json()) as ProjectListResponse
    return data.projects
  }

  async listDirectories(directory?: string): Promise<DirectoryListingResponse> {
    const query = directory ? `?path=${encodeURIComponent(directory)}` : ''
    const res = await this.fetch(`/api/directories${query}`)
    return (await res.json()) as DirectoryListingResponse
  }

  async createProject(req: CreateProjectRequest): Promise<Project> {
    const res = await this.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    const data = (await res.json()) as ProjectResponse
    return data.project
  }

  async listConversations(projectId: string): Promise<Conversation[]> {
    const res = await this.fetch(`/api/projects/${projectId}/conversations`)
    const data = (await res.json()) as ConversationListResponse
    return data.conversations
  }

  async getTimeline(conversationId: string): Promise<ConversationTimelineResponse> {
    const res = await this.fetch(`/api/conversations/${conversationId}/timeline`)
    return (await res.json()) as ConversationTimelineResponse
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.fetch(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
    })
  }

  async compactContext(conversationId: string): Promise<{
    status: 'compacted' | 'skipped' | 'failed'
    compactedItems: number
    keptItems: number
    reason?: string
    events: AnyTimelineEvent[]
  }> {
    const res = await this.fetch(`/api/conversations/${conversationId}/context/compact`, {
      method: 'POST',
    })
    return (await res.json()) as {
      status: 'compacted' | 'skipped' | 'failed'
      compactedItems: number
      keptItems: number
      reason?: string
      events: AnyTimelineEvent[]
    }
  }

  async startDraftTurn(
    projectId: string,
    req: StartTurnRequest,
  ): Promise<StartTurnResult> {
    const res = await this.fetch(`/api/projects/${projectId}/turns`, {
      method: 'POST',
      body: JSON.stringify(req),
    })
    return (await res.json()) as StartTurnResult
  }

  async continueTurn(
    conversationId: string,
    req: StartTurnRequest,
  ): Promise<StartTurnResult> {
    const res = await this.fetch(`/api/conversations/${conversationId}/turns`, {
      method: 'POST',
      body: JSON.stringify(req),
    })
    return (await res.json()) as StartTurnResult
  }

  async *subscribeConversationEvents(
    conversationId: string,
    signal?: AbortSignal,
    lastEventId?: string,
  ): AsyncGenerator<SSEEvent> {
    let cursor = lastEventId
    let retryMs = 500
    let reconnectAttempts = 0
    let lastError: unknown
    while (!signal?.aborted) {
      try {
        const res = await this.fetch(`/api/conversations/${conversationId}/events`, {
          headers: {
            Accept: 'text/event-stream',
            ...(cursor ? { 'Last-Event-ID': cursor } : {}),
          },
          signal,
        })
        for await (const event of parseSSEStream(res)) {
          cursor = event.id
          retryMs = 500
          reconnectAttempts = 0
          lastError = undefined
          yield event
        }
      } catch (error) {
        if (signal?.aborted) return
        if (error instanceof SuperagentClientError && error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) throw error
        lastError = error
      }
      if (signal?.aborted) return
      reconnectAttempts += 1
      if (reconnectAttempts >= MAX_EVENT_RECONNECT_ATTEMPTS) {
        throw lastError instanceof Error
          ? lastError
          : new Error(`Event stream reconnect limit reached (${MAX_EVENT_RECONNECT_ATTEMPTS})`)
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs))
      retryMs = Math.min(retryMs * 2, 5_000)
    }
  }

  async approveToolCall(conversationId: string, toolCallId: string): Promise<void> {
    await this.fetch(`/api/conversations/${conversationId}/approvals/${toolCallId}/approve`, {
      method: 'POST',
    })
  }

  async denyToolCall(conversationId: string, toolCallId: string): Promise<void> {
    await this.fetch(`/api/conversations/${conversationId}/approvals/${toolCallId}/deny`, {
      method: 'POST',
    })
  }

  async cancelRun(conversationId: string, runId: string): Promise<void> {
    await this.fetch(`/api/conversations/${conversationId}/runs/${runId}/cancel`, { method: 'POST' })
  }

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

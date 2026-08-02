import type {
  Conversation,
  ConversationListResponse,
  ConversationTimelineResponse,
  CreateProjectRequest,
  Device,
  DeviceListResponse,
  DeviceResponse,
  Project,
  ProjectListResponse,
  ProjectResponse,
  StartTurnRequest,
  SSEEvent,
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

  async listProjects(): Promise<Project[]> {
    const res = await this.fetch('/api/projects')
    const data = (await res.json()) as ProjectListResponse
    return data.projects
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

  async *startDraftTurn(
    projectId: string,
    req: StartTurnRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<SSEEvent> {
    const res = await this.fetch(`/api/projects/${projectId}/turns`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      signal,
      body: JSON.stringify(req),
    })
    yield* parseSSEStream(res)
  }

  async *continueTurn(
    conversationId: string,
    req: StartTurnRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<SSEEvent> {
    const res = await this.fetch(`/api/conversations/${conversationId}/turns`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      signal,
      body: JSON.stringify(req),
    })
    yield* parseSSEStream(res)
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

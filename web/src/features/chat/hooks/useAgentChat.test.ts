import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ChatClient } from '../client'
import type { ActiveConversation } from '@/stores/workspace'
import { useAgentChat } from './useAgentChat'

// Mock the SSE subscription hook to avoid async subscription in useEffect
vi.mock('./useConversationEventSubscriptions', () => ({
  useConversationEventSubscriptions: () => ({
    subscribeConversation: vi.fn(),
    disposeConversation: vi.fn(),
  }),
}))

function createMockClient(): ChatClient & {
  getTimeline: Mock
  subscribeConversationEvents: Mock
  startDraftTurn: Mock
  continueTurn: Mock
  compactContext: Mock
  approveToolCall: Mock
  denyToolCall: Mock
  cancelRun: Mock
} {
  return {
    getTimeline: vi.fn(),
    subscribeConversationEvents: vi.fn(),
    startDraftTurn: vi.fn(),
    continueTurn: vi.fn(),
    compactContext: vi.fn(),
    approveToolCall: vi.fn(),
    denyToolCall: vi.fn(),
    cancelRun: vi.fn(),
  } as any
}

function persistedTarget(conversationId: string, projectId = 'project-1'): ActiveConversation {
  return { kind: 'persisted', conversationId, projectId }
}

function draftTarget(projectId = 'project-1'): ActiveConversation & { draftId: string } {
  const draftId = crypto.randomUUID()
  return { kind: 'draft', draftId, projectId } as any
}

describe('useAgentChat', () => {
  it('sendMessage routes /compact to client.compactContext', async () => {
    const client = createMockClient()
    client.compactContext.mockResolvedValue({ status: 'compacted', compactedItems: 3, keptItems: 10, events: [] })
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, persistedTarget('conv-1'), [], onConversationCreated),
    )

    await act(async () => {
      await result.current.sendMessage('/compact')
    })

    expect(client.compactContext).toHaveBeenCalledWith('conv-1')
    expect(result.current.isCompacting).toBe(false)
  })

  it('sendMessage with draft calls startDraftTurn and fires onConversationCreated', async () => {
    const client = createMockClient()
    const target = draftTarget()
    client.startDraftTurn.mockResolvedValue({
      conversationId: 'conv-new',
      title: 'New task',
      runId: 'run-1',
      created: true,
      conversation: { id: 'conv-new', projectId: 'project-1', title: 'New task', status: 'active', agentProfile: 'coding', createdAt: '', updatedAt: '' },
    })
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, target, [], onConversationCreated),
    )

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(client.startDraftTurn).toHaveBeenCalledWith('project-1', {
      message: 'hello',
      clientMessageId: expect.any(String),
    })
    expect(onConversationCreated).toHaveBeenCalledWith({
      conversationId: 'conv-new',
      title: 'New task',
      draftId: target.draftId,
      projectId: 'project-1',
    })
  })

  it('sendMessage with persisted conversation calls continueTurn', async () => {
    const client = createMockClient()
    client.continueTurn.mockResolvedValue({
      conversationId: 'conv-1',
      title: 'Existing task',
      runId: 'run-2',
      created: false,
      conversation: { id: 'conv-1', projectId: 'project-1', title: 'Existing task', status: 'active', agentProfile: 'coding', createdAt: '', updatedAt: '' },
    })
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, persistedTarget('conv-1'), [], onConversationCreated),
    )

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(client.continueTurn).toHaveBeenCalledWith('conv-1', {
      message: 'hello',
      clientMessageId: expect.any(String),
    })
  })

  it('sendMessage is no-op when request is already pending', async () => {
    const client = createMockClient()
    let resolveFirst: () => void = () => {}
    const target = draftTarget()
    client.startDraftTurn.mockImplementation(async () => {
      await new Promise<void>((resolve) => { resolveFirst = resolve })
      return {
        conversationId: 'conv-new',
        title: 'Task',
        runId: 'run-1',
        created: true,
        conversation: { id: 'conv-new', projectId: 'project-1', title: 'Task', status: 'active', agentProfile: 'coding', createdAt: '', updatedAt: '' },
      }
    })
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, target, [], onConversationCreated),
    )

    result.current.sendMessage('first')

    await act(async () => {
      await result.current.sendMessage('second')
    })

    resolveFirst()

    expect(client.startDraftTurn).toHaveBeenCalledTimes(1)
  })

  it('approveTool calls client.approveToolCall', async () => {
    const client = createMockClient()
    client.approveToolCall.mockResolvedValue(undefined)
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, persistedTarget('conv-1'), [], onConversationCreated),
    )

    await act(async () => {
      await result.current.approveTool('tool-1')
    })

    expect(client.approveToolCall).toHaveBeenCalledWith('conv-1', 'tool-1')
  })

  it('denyTool calls client.denyToolCall', async () => {
    const client = createMockClient()
    client.denyToolCall.mockResolvedValue(undefined)
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, persistedTarget('conv-1'), [], onConversationCreated),
    )

    await act(async () => {
      await result.current.denyTool('tool-1')
    })

    expect(client.denyToolCall).toHaveBeenCalledWith('conv-1', 'tool-1')
  })

  it('sendMessage with no target shows error when no project selected', async () => {
    const client = createMockClient()
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, null, [], onConversationCreated),
    )

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.error).toBe('请先添加或选择一个项目')
  })

  it('sendMessage handles client errors gracefully', async () => {
    const client = createMockClient()
    const target = draftTarget()
    client.startDraftTurn.mockRejectedValue(new Error('Network error'))
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, target, [], onConversationCreated),
    )

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.isLoading).toBe(false)
  })

  it('compactContext handles client errors gracefully', async () => {
    const client = createMockClient()
    client.compactContext.mockRejectedValue(new Error('Compact failed'))
    const onConversationCreated = vi.fn()

    const { result } = renderHook(() =>
      useAgentChat(client, persistedTarget('conv-1'), [], onConversationCreated),
    )

    await act(async () => {
      await result.current.compactContext()
    })

    expect(result.current.error).toBe('Compact failed')
    expect(result.current.isCompacting).toBe(false)
  })
})
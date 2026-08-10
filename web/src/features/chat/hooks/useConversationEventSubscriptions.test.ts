import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ChatClient } from '../client'
import type { ChatAction } from '../state/reducer'
import { useConversationEventSubscriptions } from './useConversationEventSubscriptions'

function createMockClient(): ChatClient & { getTimeline: Mock; subscribeConversationEvents: Mock } {
  return {
    getTimeline: vi.fn(),
    subscribeConversationEvents: vi.fn(),
    startDraftTurn: vi.fn() as any,
    continueTurn: vi.fn() as any,
    compactContext: vi.fn() as any,
    approveToolCall: vi.fn() as any,
    denyToolCall: vi.fn() as any,
    cancelRun: vi.fn() as any,
  }
}

function makeEvent(type: string, overrides = {}): any {
  return {
    id: 'evt-1',
    conversationId: 'conv-1',
    runId: 'run-1',
    sequence: 1,
    type,
    data: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useConversationEventSubscriptions', () => {
  it('subscribeConversation loads timeline and dispatches LOAD_ENTRIES', async () => {
    const client = createMockClient()
    client.getTimeline.mockResolvedValue({
      conversation: { runtimeStatus: 'running' },
      events: [
        makeEvent('turn.started', { data: { title: 'Test', userMessageId: 'u1', userText: 'hi', assistantMessageId: 'a1' }, runId: 'run-1', sequence: 1 }),
      ],
    })
    client.subscribeConversationEvents.mockReturnValue(async function* () {}())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
    })

    await vi.waitFor(() => {
      const loadEntry: [string, ChatAction] | undefined = dispatchFor.mock.calls.find(
        (call: any) => call[0] === 'conversation:conv-1',
      ) as any
      expect(loadEntry).toBeDefined()
      expect(loadEntry![1].type).toBe('LOAD_ENTRIES')
    })
  })

  it('subscribeConversation dispatches SSE events as they arrive', async () => {
    const client = createMockClient()
    client.getTimeline.mockResolvedValue({
      conversation: { runtimeStatus: 'idle' },
      events: [],
    })

    async function* generateEvents() {
      yield makeEvent('message.delta', { data: { messageId: 'a1', text: 'Hello' }, sequence: 1 })
      yield makeEvent('message.delta', { data: { messageId: 'a1', text: ' world' }, sequence: 2 })
      yield makeEvent('run.completed', { data: { output: 'Hello world' }, sequence: 3 })
    }
    client.subscribeConversationEvents.mockReturnValue(generateEvents())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
    })

    await vi.waitFor(() => {
      const timelineEvents = dispatchFor.mock.calls.filter(
        (call: any) => call[0] === 'conversation:conv-1' && call[1].type === 'TIMELINE_EVENT',
      )
      expect(timelineEvents).toHaveLength(3)
    })
  })

  it('disposeConversation aborts subscription and clears state', async () => {
    const client = createMockClient()
    client.getTimeline.mockResolvedValue({
      conversation: { runtimeStatus: 'idle' },
      events: [],
    })
    client.subscribeConversationEvents.mockReturnValue(async function* () {
      await new Promise(() => {})
    }())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
    })

    await vi.waitFor(() => {
      expect(dispatchFor).toHaveBeenCalled()
    })

    act(() => {
      result.current.disposeConversation('conv-1')
    })

    expect(clearStateFor).toHaveBeenCalledWith('conversation:conv-1')
  })

  it('duplicate subscribeConversation calls are ignored', async () => {
    const client = createMockClient()
    client.getTimeline.mockResolvedValue({
      conversation: { runtimeStatus: 'idle' },
      events: [],
    })
    client.subscribeConversationEvents.mockReturnValue(async function* () {}())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
      result.current.subscribeConversation('conv-1')
    })

    expect(client.getTimeline).toHaveBeenCalledTimes(1)
  })

  it('handles timeline fetch errors gracefully', async () => {
    const client = createMockClient()
    client.getTimeline.mockRejectedValue(new Error('API error'))
    client.subscribeConversationEvents.mockReturnValue(async function* () {}())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
    })

    await vi.waitFor(() => {
      const errorCall: [string, ChatAction] | undefined = dispatchFor.mock.calls.find(
        (call: any) =>
          call[0] === 'conversation:conv-1' && call[1].type === 'ERROR',
      ) as any
      expect(errorCall).toBeDefined()
    })
  })

  it('auto-subscribes to a child conversation on subagent.started', async () => {
    const client = createMockClient()
    client.getTimeline.mockResolvedValue({
      conversation: { runtimeStatus: 'running' },
      events: [],
    })

    async function* generateEvents() {
      yield makeEvent('subagent.started', {
        data: { childConversationId: 'child-1', title: 'Explore', toolCallId: 'tool-1' },
        sequence: 1,
      })
    }
    client.subscribeConversationEvents.mockReturnValue(generateEvents())

    const dispatchFor = vi.fn()
    const clearStateFor = vi.fn()

    const { result } = renderHook(() =>
      useConversationEventSubscriptions(client, dispatchFor, clearStateFor),
    )

    await act(async () => {
      result.current.subscribeConversation('conv-1')
    })

    await vi.waitFor(() => {
      expect(client.getTimeline).toHaveBeenCalledWith('child-1')
    })
  })
})
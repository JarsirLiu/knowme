import { describe, expect, it } from 'vitest'
import type { AnyTimelineEvent, ConversationRuntimeStatus } from '@superagent/core'
import type { ChatEntry, ChatState } from '../types'
import { applyTimelineEvent, chatReducer } from './reducer'

const initialState: ChatState = {
  entries: [],
  runtimeStatus: 'idle',
  requestPending: false,
  isLoading: false,
  isCompacting: false,
  error: null,
}

function event<T extends AnyTimelineEvent['type']>(
  type: T,
  data: Extract<AnyTimelineEvent, { type: T }>['data'],
  runId: string | null = 'run-1',
  sequence = 1,
): Extract<AnyTimelineEvent, { type: T }> {
  return {
    id: `event-${sequence}`,
    conversationId: 'conversation-1',
    runId,
    sequence,
    type,
    data,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as Extract<AnyTimelineEvent, { type: T }>
}

function apply(state: ChatState, timelineEvent: AnyTimelineEvent): ChatState {
  return chatReducer(state, { type: 'TIMELINE_EVENT', event: timelineEvent })
}

function turnStarted() {
  return event('turn.started', {
    title: 'Test task',
    userMessageId: 'user-1',
    userText: 'Inspect the project',
    assistantMessageId: 'assistant-1',
  })
}

function latestTurn(state: ChatState) {
  const entry = state.entries.at(-1)
  expect(entry?.type).toBe('turn')
  return (entry as Extract<ChatEntry, { type: 'turn' }>).turn
}

describe('chatReducer', () => {
  it('hydrates active runtime statuses as loading', () => {
    const state = chatReducer(initialState, {
      type: 'LOAD_ENTRIES',
      entries: [],
      runtimeStatus: 'waiting_approval',
    })

    expect(state.runtimeStatus).toBe('waiting_approval')
    expect(state.isLoading).toBe(true)
  })

  it('keeps timeline hydration idempotent for duplicate turn.started events', () => {
    const started = turnStarted()
    const entries = applyTimelineEvent([], started)

    expect(applyTimelineEvent(entries, started)).toEqual(entries)
  })

  it('finishes a streamed reply and clears loading', () => {
    let state = apply(initialState, turnStarted())
    state = apply(state, event('run.started', {}))
    state = apply(state, event('message.delta', { messageId: 'assistant-1', text: 'Hello' }, 'run-1', 2))
    state = apply(state, event('message.delta', { messageId: 'assistant-1', text: ' world' }, 'run-1', 3))
    state = apply(state, event('run.completed', { output: 'Hello world' }, 'run-1', 4))

    const turn = latestTurn(state)
    expect(turn.assistantMessage.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(turn.assistantMessage.status).toBe('completed')
    expect(state.runtimeStatus).toBe('idle')
    expect(state.isLoading).toBe(false)
  })

  it.each([
    ['run.failed', 'failed'],
    ['run.cancelled', 'cancelled'],
    ['run.interrupted', 'interrupted'],
  ] as const)('ends loading after %s', (type, runtimeStatus: ConversationRuntimeStatus) => {
    let state = apply(initialState, turnStarted())
    state = apply(state, event(type, { error: 'execution stopped' }, 'run-1', 2))

    expect(latestTurn(state).assistantMessage.status).toBe('incomplete')
    expect(state.runtimeStatus).toBe(runtimeStatus)
    expect(state.isLoading).toBe(false)
  })

  it('preserves approval state until the run is resumed', () => {
    let state = apply(initialState, turnStarted())
    state = apply(state, event('tool.called', { messageId: 'assistant-1', toolCallId: 'tool-1', name: 'read_file' }, 'run-1', 2))
    state = apply(state, event('tool.awaiting_approval', { toolCallId: 'tool-1', name: 'read_file', args: { path: 'README.md' } }, 'run-1', 3))
    state = apply(state, event('run.waiting_approval', {}, 'run-1', 4))

    expect(latestTurn(state).assistantMessage.toolCalls[0]).toMatchObject({
      id: 'tool-1',
      status: 'awaiting_approval',
      args: { path: 'README.md' },
    })
    expect(state.runtimeStatus).toBe('waiting_approval')
    expect(state.isLoading).toBe(true)

    state = apply(state, event('run.resumed', {}, 'run-1', 5))
    expect(state.runtimeStatus).toBe('running')
    expect(state.isLoading).toBe(true)
  })

  it('accumulates tool.arguments.delta and replaces with final tool.arguments', () => {
    let state = apply(initialState, turnStarted())
    state = apply(state, event('tool.called', { messageId: 'assistant-1', toolCallId: 'tool-1', name: 'read_file' }, 'run-1', 2))
    state = apply(state, event('tool.arguments.delta', { toolCallId: 'tool-1', delta: '{"file' }, 'run-1', 3))
    state = apply(state, event('tool.arguments.delta', { toolCallId: 'tool-1', delta: '":"RE' }, 'run-1', 4))
    state = apply(state, event('tool.arguments.delta', { toolCallId: 'tool-1', delta: 'ADME.md"}' }, 'run-1', 5))

    let tool = latestTurn(state).assistantMessage.toolCalls[0]
    expect(tool.rawArgs).toBe('{"file":"README.md"}')
    expect(tool.args).toEqual({})

    state = apply(state, event('tool.arguments', { toolCallId: 'tool-1', args: { path: 'README.md' } }, 'run-1', 6))
    tool = latestTurn(state).assistantMessage.toolCalls[0]
    expect(tool.rawArgs).toBeUndefined()
    expect(tool.args).toEqual({ path: 'README.md' })
  })

  it('keeps separate conversation state transitions independent', () => {
    const conversationA = apply(initialState, turnStarted())
    const conversationB = apply(initialState, event('turn.started', {
      title: 'Other task',
      userMessageId: 'user-2',
      userText: 'Other request',
      assistantMessageId: 'assistant-2',
    }, 'run-2'))
    const completedA = apply(conversationA, event('run.completed', { output: 'done' }))

    expect(completedA.runtimeStatus).toBe('idle')
    expect(completedA.isLoading).toBe(false)
    expect(conversationB.runtimeStatus).toBe('queued')
    expect(conversationB.isLoading).toBe(true)
    expect(conversationB.entries).toHaveLength(1)
    expect(latestTurn(conversationB).userMessage.content[0].text).toBe('Other request')
  })
})

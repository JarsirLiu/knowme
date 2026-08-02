import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ConversationTimeline, TimelineMessage } from '@superagent/core'
import { client } from '@/api/client'
import { chatReducer } from '../state/reducer'
import type { AssistantPart, ChatEntry, ChatState, ContextCompaction, Turn } from '../types'

export type ActiveConversation =
  | { kind: 'draft'; draftId: string; projectId: string; conversationId?: string; title?: string }
  | { kind: 'persisted'; conversationId: string; projectId: string }

const INITIAL_STATE: ChatState = {
  entries: [],
  isLoading: false,
  isCompacting: false,
  error: null,
}

function timelineToEntries(timeline: ConversationTimeline): ChatEntry[] {
  const entries: ChatEntry[] = []
  let pendingUser: TimelineMessage | undefined
  let pendingCompactions: ContextCompaction[] = []

  for (const message of timeline.messages) {
    if (message.kind === 'context_compaction') {
      const compaction: ContextCompaction = {
        id: message.id,
        trigger: message.trigger ?? 'auto',
        status: message.compactionStatus === 'failed' ? 'failed' : 'completed',
        compactedItems: message.compactedItems,
        keptItems: message.keptItems,
      }
      if (compaction.trigger === 'auto' && pendingUser) pendingCompactions.push(compaction)
      else entries.push({ type: 'compaction', compaction })
      continue
    }
    if (message.role === 'user') {
      pendingUser = message
      continue
    }

    if (message.role !== 'assistant') continue
    const user = pendingUser
    pendingUser = undefined
    if (!user) continue

    const parts: AssistantPart[] = [
      ...pendingCompactions.map((compaction): AssistantPart => ({ type: 'compaction', compaction })),
      { type: 'content', content: { type: 'text', text: message.content } },
      ...(message.toolCalls ?? []).map((tool): AssistantPart => ({ type: 'tool', callId: tool.id })),
    ]
    entries.push({ type: 'turn', turn: {
      id: message.runId ?? message.id,
      userMessage: {
        id: user.id,
        role: 'user',
        status: 'completed',
        content: [{ type: 'text', text: user.content }],
      },
      assistantMessage: {
        id: message.id,
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'text', text: message.content }],
        toolCalls: (message.toolCalls ?? []).map((tool) => ({
          id: tool.id,
          name: tool.name,
          args: tool.args,
          status: tool.status as never,
          result: tool.result,
          error: tool.error,
        })),
        parts,
      },
    } })
    pendingCompactions = []
  }

  if (pendingUser) {
    entries.push({ type: 'turn', turn: {
      id: pendingUser.runId ?? pendingUser.id,
      userMessage: {
        id: pendingUser.id,
        role: 'user',
        status: 'completed',
        content: [{ type: 'text', text: pendingUser.content }],
      },
      assistantMessage: {
        id: `assistant-${pendingUser.id}`,
        role: 'assistant',
        status: 'incomplete',
        content: [],
        toolCalls: [],
        parts: [],
      },
    } })
  }

  return entries
}

export function useAgentChat(
  target: ActiveConversation | null,
  onConversationCreated: (data: { conversationId: string; title: string }) => void,
) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const targetKey = target
    ? target.kind === 'draft' ? `draft:${target.draftId}` : `conversation:${target.conversationId}`
    : 'none'

  useEffect(() => {
    let cancelled = false
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: 'RESET' })

    if (!target || target.kind === 'draft') return () => { cancelled = true }

    client.getTimeline(target.conversationId)
      .then((timeline) => {
        if (!cancelled) dispatch({ type: 'LOAD_ENTRIES', entries: timelineToEntries(timeline) })
      })
      .catch((error) => {
        if (!cancelled) dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
      })

    return () => { cancelled = true }
  }, [targetKey])

  const sendMessage = useCallback(async (text: string) => {
    const activeTarget = target
    if (!activeTarget || !text.trim() || state.isLoading || state.isCompacting) return

    if (text.trim() === '/compact') {
      const conversationId = activeTarget.kind === 'persisted' ? activeTarget.conversationId : activeTarget.conversationId
      if (!conversationId) return
      const id = crypto.randomUUID()
      dispatch({ type: 'COMPACTION_START', compaction: { id, trigger: 'manual', status: 'running' } })
      try {
        const result = await client.compactContext(conversationId)
        dispatch({
          type: 'COMPACTION_UPDATE',
          id,
          update: {
            status: 'completed',
            compactedItems: result.compactedItems,
            keptItems: result.keptItems,
            reason: result.reason,
          },
        })
      } catch (error) {
        dispatch({ type: 'COMPACTION_UPDATE', id, update: { status: 'failed', error: error instanceof Error ? error.message : String(error) } })
      }
      return
    }

    const turnId = crypto.randomUUID()
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'TURN_START', userId: crypto.randomUUID(), userText: text, turnId })

    try {
      const request = { message: text, clientMessageId: crypto.randomUUID() }
      const persistedConversationId = activeTarget.kind === 'persisted'
        ? activeTarget.conversationId
        : activeTarget.conversationId
      const events = persistedConversationId
        ? client.continueTurn(persistedConversationId, request, controller.signal)
        : activeTarget.kind === 'draft'
        ? client.startDraftTurn(activeTarget.projectId, request, controller.signal)
        : client.continueTurn(activeTarget.conversationId, request, controller.signal)

      for await (const event of events) {
        switch (event.type) {
          case 'conversation_created':
            onConversationCreated({
              conversationId: event.data.conversationId,
              title: event.data.title,
            })
            break
          case 'text_delta':
            dispatch({ type: 'CONTENT_APPEND', turnId, content: { type: 'text', text: event.data.text } })
            break
          case 'reasoning_delta':
            dispatch({ type: 'CONTENT_APPEND', turnId, content: { type: 'reasoning', text: event.data.text } })
            break
          case 'context_compaction':
            if (event.data.status === 'started') {
              dispatch({ type: 'COMPACTION_START', compaction: { id: event.data.id, trigger: event.data.trigger, status: 'running' } })
            } else {
              dispatch({ type: 'COMPACTION_UPDATE', id: event.data.id, update: { status: event.data.status === 'completed' ? 'completed' : 'failed', compactedItems: event.data.compactedItems, keptItems: event.data.keptItems, reason: event.data.reason, error: event.data.error } })
            }
            break
          case 'tool_call_start':
            dispatch({ type: 'TOOL_CALL_START', turnId, callId: event.data.id, name: event.data.name })
            break
          case 'tool_call_awaiting_approval':
            dispatch({ type: 'TOOL_CALL_ARGS', turnId, callId: event.data.id, args: event.data.args })
            dispatch({ type: 'TOOL_CALL_STATUS', turnId, callId: event.data.id, status: 'awaiting_approval' })
            break
          case 'tool_call_completed':
            dispatch({ type: 'TOOL_CALL_STATUS', turnId, callId: event.data.id, status: 'completed', result: event.data.result })
            break
          case 'tool_call_denied':
            dispatch({ type: 'TOOL_CALL_STATUS', turnId, callId: event.data.id, status: 'denied' })
            break
          case 'error':
            dispatch({ type: 'ERROR', message: event.data.message })
            return
          case 'status':
            if (event.data.status === 'idle') dispatch({ type: 'TURN_END' })
            break
        }
      }
      dispatch({ type: 'TURN_END' })
    } catch (error) {
      if (controller.signal.aborted) dispatch({ type: 'CANCEL' })
      else dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [onConversationCreated, state.isLoading, target])

  const approveTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : target?.conversationId
    if (!conversationId) return
    try {
      await client.approveToolCall(conversationId, toolCallId)
      dispatch({ type: 'TOOL_CALL_STATUS', turnId: 'latest', callId: toolCallId, status: 'running' })
    } catch (error) {
      dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [target])

  const denyTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : target?.conversationId
    if (!conversationId) return
    try {
      await client.denyToolCall(conversationId, toolCallId)
      dispatch({ type: 'TOOL_CALL_STATUS', turnId: 'latest', callId: toolCallId, status: 'denied' })
    } catch (error) {
      dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [target])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'CANCEL' })
  }, [])

  return {
    entries: state.entries,
    isLoading: state.isLoading,
    isCompacting: state.isCompacting,
    error: state.error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
  }
}

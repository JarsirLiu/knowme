import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ConversationTimeline } from '@superagent/core'
import { client } from '@/api/client'
import { applyTimelineEvent, chatReducer } from '../state/reducer'
import type { ChatEntry, ChatState } from '../types'

export type ActiveConversation =
  | { kind: 'draft'; draftId: string; projectId: string }
  | { kind: 'persisted'; conversationId: string; projectId: string }

const INITIAL_STATE: ChatState = {
  entries: [],
  isLoading: false,
  isCompacting: false,
  error: null,
}

function timelineToEntries(timeline: ConversationTimeline): ChatEntry[] {
  return timeline.events.reduce(
    (entries, event) => applyTimelineEvent(entries, event),
    [] as ChatEntry[],
  )
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
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    dispatch({ type: 'RESET' })

    if (!target || target.kind === 'draft') {
      return () => {
        cancelled = true
        controller.abort()
        if (abortRef.current === controller) abortRef.current = null
      }
    }

    void (async () => {
      try {
        const timeline = await client.getTimeline(target.conversationId)
        if (cancelled) return
        dispatch({ type: 'LOAD_ENTRIES', entries: timelineToEntries(timeline) })
        const lastEventId = timeline.events.at(-1)?.id
        for await (const event of client.subscribeConversationEvents(target.conversationId, controller.signal, lastEventId)) {
          if (cancelled) return
          dispatch({ type: 'TIMELINE_EVENT', event })
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [targetKey])

  const sendMessage = useCallback(async (text: string) => {
    const activeTarget = target
    if (!text.trim() || state.isLoading || state.isCompacting) return
    if (!activeTarget) {
      dispatch({ type: 'ERROR', message: '请先添加或选择一个项目' })
      return
    }

    if (text.trim() === '/compact') {
      const conversationId = activeTarget.kind === 'persisted' ? activeTarget.conversationId : undefined
      if (!conversationId) return
      dispatch({ type: 'COMPACTION_REQUEST' })
      try {
        const result = await client.compactContext(conversationId)
        for (const event of result.events ?? []) {
          dispatch({ type: 'TIMELINE_EVENT', event })
        }
      } catch (error) {
        dispatch({
          type: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    try {
      const request = { message: text, clientMessageId: crypto.randomUUID() }
      const result = activeTarget.kind === 'draft'
        ? await client.startDraftTurn(activeTarget.projectId, request)
        : await client.continueTurn(activeTarget.conversationId, request)
      if (activeTarget.kind === 'draft') {
        onConversationCreated({ conversationId: result.conversationId, title: result.title })
      }
    } catch (error) {
      dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [onConversationCreated, state.isLoading, target])

  const approveTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    if (!conversationId) return
    try {
      await client.approveToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [target])

  const denyTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    if (!conversationId) return
    try {
      await client.denyToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [target])

  const stop = useCallback(() => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    const activeRun = [...state.entries].reverse().find((entry) => entry.type === 'turn' && (
      entry.turn.assistantMessage.status === 'streaming' || entry.turn.assistantMessage.status === 'waiting_approval'))
    if (conversationId && activeRun?.type === 'turn') {
      void client.cancelRun(conversationId, activeRun.turn.id).catch(() => undefined)
    }
    dispatch({ type: 'CANCEL' })
  }, [state.entries, target])

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

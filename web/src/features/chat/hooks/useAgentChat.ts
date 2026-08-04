import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationRuntimeStatus } from '@superagent/core'
import { client } from '@/api/client'
import { chatReducer } from '../state/reducer'
import type { ChatEntry, ChatState } from '../types'
import { useConversationEventSubscriptions } from './useConversationEventSubscriptions'

export type ActiveConversation =
  | { kind: 'draft'; draftId: string; projectId: string }
  | { kind: 'persisted'; conversationId: string; projectId: string }

export type ConversationDisplayStatus = ConversationRuntimeStatus | 'error'

const INITIAL_STATE: ChatState = {
  entries: [],
  runtimeStatus: 'idle',
  requestPending: false,
  isLoading: false,
  isCompacting: false,
  error: null,
}

export function useAgentChat(
  target: ActiveConversation | null,
  activeConversationIds: readonly string[],
  onConversationCreated: (data: { conversationId: string; title: string; draftId: string; projectId: string }) => void,
) {
  const [states, setStates] = useState<Record<string, ChatState>>({})
  const statesRef = useRef<Record<string, ChatState>>({})
  const targetKey = target
    ? target.kind === 'draft' ? `draft:${target.draftId}` : `conversation:${target.conversationId}`
    : 'none'

  const clearStateFor = useCallback((key: string) => {
    delete statesRef.current[key]
    setStates((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const dispatchFor = useCallback((key: string, action: Parameters<typeof chatReducer>[1]) => {
    const next = chatReducer(statesRef.current[key] ?? INITIAL_STATE, action)
    statesRef.current = { ...statesRef.current, [key]: next }
    setStates((current) => ({ ...current, [key]: next }))
  }, [])

  const { subscribeConversation, disposeConversation } = useConversationEventSubscriptions(dispatchFor, clearStateFor)

  useEffect(() => {
    for (const conversationId of activeConversationIds) subscribeConversation(conversationId)
    if (target?.kind === 'persisted') subscribeConversation(target.conversationId)
  }, [activeConversationIds, subscribeConversation, target?.kind, target?.kind === 'persisted' ? target.conversationId : undefined])

  const state = states[targetKey] ?? INITIAL_STATE

  const sendMessage = useCallback(async (text: string) => {
    const activeTarget = target
    const key = targetKey
    const currentState = statesRef.current[key] ?? INITIAL_STATE
    if (!text.trim() || currentState.requestPending || currentState.isLoading || currentState.isCompacting) return
    if (!activeTarget) {
      dispatchFor(key, { type: 'ERROR', message: '请先添加或选择一个项目', runtimeStatus: 'idle' })
      return
    }

    if (text.trim() === '/compact') {
      const conversationId = activeTarget.kind === 'persisted' ? activeTarget.conversationId : undefined
      if (!conversationId) return
      dispatchFor(key, { type: 'COMPACTION_REQUEST' })
      try {
        const result = await client.compactContext(conversationId)
        for (const event of result.events ?? []) {
          dispatchFor(key, { type: 'TIMELINE_EVENT', event })
        }
        dispatchFor(key, { type: 'COMPACTION_END' })
      } catch (error) {
        dispatchFor(key, {
          type: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
          runtimeStatus: currentState.runtimeStatus,
        })
      }
      return
    }

    dispatchFor(key, { type: 'REQUEST_START' })
    try {
      const request = { message: text, clientMessageId: crypto.randomUUID() }
      const result = activeTarget.kind === 'draft'
        ? await client.startDraftTurn(activeTarget.projectId, request)
        : await client.continueTurn(activeTarget.conversationId, request)
      if (activeTarget.kind === 'draft') {
        clearStateFor(key)
        subscribeConversation(result.conversationId)
        onConversationCreated({
          conversationId: result.conversationId,
          title: result.title,
          draftId: activeTarget.draftId,
          projectId: activeTarget.projectId,
        })
      } else {
        dispatchFor(key, { type: 'REQUEST_END' })
      }
    } catch (error) {
      dispatchFor(key, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
        runtimeStatus: 'idle',
      })
    }
  }, [clearStateFor, dispatchFor, onConversationCreated, subscribeConversation, target, targetKey])

  const approveTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    if (!conversationId) return
    try {
      await client.approveToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatchFor(targetKey, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [dispatchFor, target, targetKey])

  const denyTool = useCallback(async (toolCallId: string) => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    if (!conversationId) return
    try {
      await client.denyToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatchFor(targetKey, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [dispatchFor, target, targetKey])

  const stop = useCallback(() => {
    const conversationId = target?.kind === 'persisted' ? target.conversationId : undefined
    const activeRun = [...state.entries].reverse().find((entry) => entry.type === 'turn' && (
      entry.turn.assistantMessage.status === 'streaming' || entry.turn.assistantMessage.status === 'waiting_approval'))
    if (conversationId && activeRun?.type === 'turn') {
      void client.cancelRun(conversationId, activeRun.turn.id).catch(() => undefined)
    }
    dispatchFor(targetKey, { type: 'CANCEL' })
  }, [dispatchFor, state.entries, target, targetKey])

  const statusByConversation = Object.fromEntries(
    Object.entries(states)
      .filter(([key]) => key.startsWith('conversation:'))
      .map(([key, chatState]) => [
        key.replace(/^conversation:/, ''),
        chatState.error ? 'error' : chatState.runtimeStatus,
      ]),
  ) as Record<string, ConversationDisplayStatus>

  return {
    entries: state.entries,
    isLoading: state.isLoading,
    isCompacting: state.isCompacting,
    error: state.error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
    disposeConversation,
    statusByConversation,
  }
}

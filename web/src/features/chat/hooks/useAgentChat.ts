import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationRuntimeStatus } from '@cloudagent/core'
import type { ActiveConversation } from '@/stores/workspace'
import { chatReducer } from '../state/reducer'
import type { ChatState } from '../types'
import { useConversationEventSubscriptions } from './useConversationEventSubscriptions'
import type { ChatClient } from '../client'

const INITIAL_STATE: ChatState = {
  entries: [],
  runtimeStatus: 'idle',
  requestPending: false,
  isLoading: false,
  isCompacting: false,
  error: null,
}

function persistedConversationId(target: ActiveConversation | null): string | undefined {
  return target?.kind === 'persisted' ? target.conversationId : undefined
}

function buildStatusMap(
  states: Record<string, ChatState>,
): Record<string, ConversationRuntimeStatus | 'error'> {
  return Object.fromEntries(
    Object.entries(states)
      .filter(([key]) => key.startsWith('conversation:'))
      .map(([key, chatState]) => [
        key.replace(/^conversation:/, ''),
        chatState.error ? 'error' : chatState.runtimeStatus,
      ]),
  )
}

export function useAgentChat(
  client: ChatClient,
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

  const { subscribeConversation, disposeConversation } = useConversationEventSubscriptions(client, dispatchFor)

  useEffect(() => {
    const subscribed = new Set<string>()
    for (const conversationId of activeConversationIds) {
      subscribeConversation(conversationId)
      subscribed.add(conversationId)
    }
    const persistedId = persistedConversationId(target)
    if (persistedId) {
      subscribeConversation(persistedId)
      subscribed.add(persistedId)
    }
    return () => {
      for (const conversationId of subscribed) {
        disposeConversation(conversationId)
      }
    }
  }, [activeConversationIds, subscribeConversation, disposeConversation, target])

  const state = states[targetKey] ?? INITIAL_STATE

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const activeTarget = target
    const key = targetKey
    const currentState = statesRef.current[key] ?? INITIAL_STATE
    if (currentState.requestPending || currentState.isLoading || currentState.isCompacting) return

    if (!activeTarget) {
      dispatchFor(key, { type: 'ERROR', message: '请先添加或选择一个项目', runtimeStatus: 'idle' })
      return
    }

    dispatchFor(key, { type: 'REQUEST_START' })
    try {
      const request = { message: trimmed, clientMessageId: crypto.randomUUID() }
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
  }, [clearStateFor, client, dispatchFor, onConversationCreated, subscribeConversation, target, targetKey])

  const compactContext = useCallback(async () => {
    const key = targetKey
    const currentState = statesRef.current[key] ?? INITIAL_STATE
    if (currentState.isCompacting) return
    const conversationId = persistedConversationId(target)
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
  }, [client, dispatchFor, target, targetKey])

  const approveTool = useCallback(async (toolCallId: string) => {
    const conversationId = persistedConversationId(target)
    if (!conversationId) return
    try {
      await client.approveToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatchFor(targetKey, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [client, dispatchFor, target, targetKey])

  const denyTool = useCallback(async (toolCallId: string) => {
    const conversationId = persistedConversationId(target)
    if (!conversationId) return
    try {
      await client.denyToolCall(conversationId, toolCallId)
    } catch (error) {
      dispatchFor(targetKey, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [client, dispatchFor, target, targetKey])

  const stop = useCallback(() => {
    const conversationId = persistedConversationId(target)
    const activeRun = [...state.entries].reverse().find((entry) => entry.type === 'turn' && (
      entry.turn.assistantMessage.status === 'streaming' || entry.turn.assistantMessage.status === 'waiting_approval'))
    if (conversationId && activeRun?.type === 'turn') {
      void client.cancelRun(conversationId, activeRun.turn.id).catch(() => undefined)
    }
    dispatchFor(targetKey, { type: 'CANCEL' })
  }, [client, dispatchFor, state.entries, target, targetKey])

  const statusByConversation = buildStatusMap(states)

  return {
    entries: state.entries,
    isLoading: state.isLoading,
    isCompacting: state.isCompacting,
    error: state.error,
    sendMessage,
    compactContext,
    approveTool,
    denyTool,
    stop,
    disposeConversation,
    statusByConversation,
  }
}
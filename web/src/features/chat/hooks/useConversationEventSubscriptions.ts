import { useCallback, useEffect, useRef } from 'react'
import type { ConversationRuntimeStatus } from '@superagent/core'
import { applyTimelineEvent, type ChatAction } from '../state/reducer'
import type { ChatEntry } from '../types'
import type { ChatClient } from '../client'

type DispatchConversation = (key: string, action: ChatAction) => void
type ClearConversationState = (key: string) => void

function conversationKey(conversationId: string) {
  return `conversation:${conversationId}`
}

function timelineToEntries(timeline: { conversation: { runtimeStatus?: ConversationRuntimeStatus }; events: import('@superagent/core').AnyTimelineEvent[] }): ChatEntry[] {
  return timeline.events.reduce(
    (entries, event) => applyTimelineEvent(entries, event),
    [] as ChatEntry[],
  )
}

export function useConversationEventSubscriptions(
  client: ChatClient,
  dispatchFor: DispatchConversation,
  clearStateFor: ClearConversationState,
) {
  const subscriptionsRef = useRef(new Map<string, AbortController>())

  const subscribeConversation = useCallback((conversationId: string) => {
    const key = conversationKey(conversationId)
    if (subscriptionsRef.current.has(key)) return

    const controller = new AbortController()
    subscriptionsRef.current.set(key, controller)

    void (async () => {
      try {
        const timeline = await client.getTimeline(conversationId)
        if (controller.signal.aborted) return
        const runtimeStatus: ConversationRuntimeStatus | undefined = timeline.conversation.runtimeStatus
        dispatchFor(key, {
          type: 'LOAD_ENTRIES',
          entries: timelineToEntries(timeline),
          runtimeStatus,
        })
        const lastEventId = timeline.events.at(-1)?.id
        for await (const event of client.subscribeConversationEvents(conversationId, controller.signal, lastEventId)) {
          if (controller.signal.aborted) return
          dispatchFor(key, { type: 'TIMELINE_EVENT', event })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatchFor(key, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) })
        }
      } finally {
        if (subscriptionsRef.current.get(key) === controller) subscriptionsRef.current.delete(key)
      }
    })()
  }, [client, dispatchFor])

  const disposeConversation = useCallback((conversationId: string) => {
    const key = conversationKey(conversationId)
    const controller = subscriptionsRef.current.get(key)
    controller?.abort()
    subscriptionsRef.current.delete(key)
    clearStateFor(key)
  }, [clearStateFor])

  useEffect(() => () => {
    for (const controller of subscriptionsRef.current.values()) controller.abort()
    subscriptionsRef.current.clear()
  }, [])

  return { subscribeConversation, disposeConversation }
}
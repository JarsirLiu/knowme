import type { AnyTimelineEvent } from '@superagent/core'

type Listener = (event: AnyTimelineEvent) => void

/**
 * In-memory notification only. TimelineEventStore remains the source of truth;
 * this hub exists solely to wake connected SSE clients without coupling them to
 * the agent execution lifecycle.
 */
export class TimelineEventHub {
  private readonly listeners = new Map<string, Set<Listener>>()

  subscribe(conversationId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(conversationId) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(conversationId, listeners)

    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(conversationId)
    }
  }

  publish(event: AnyTimelineEvent): void {
    for (const listener of [...(this.listeners.get(event.conversationId) ?? [])]) {
      try {
        listener(event)
      } catch {
        // A disconnected SSE client must not make the durable append fail.
      }
    }
  }
}

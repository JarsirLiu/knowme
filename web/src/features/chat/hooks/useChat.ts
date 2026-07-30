import { useState, useCallback, useRef } from 'react'
import { client } from '@/api/client'
import type { SSEEvent, MessageContent } from '@superagent/core'

export interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: MessageContent[]
  pending?: boolean
}

export interface ChatState {
  messages: UIMessage[]
  isLoading: boolean
  error: string | null
  pendingToolCall: { id: string; name: string; args: unknown } | null
}

export function useChat(sessionId: string) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    pendingToolCall: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || state.isLoading) return

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
    }

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true,
      error: null,
      pendingToolCall: null,
    }))

    try {
      const events = client.chat(sessionId, text)
      let assistantMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: [],
      }

      for await (const event of events) {
        switch (event.type) {
          case 'text_delta': {
            const lastContent = assistantMsg.content[assistantMsg.content.length - 1]
            if (lastContent?.type === 'text') {
              lastContent.text += event.data.text
            } else {
              assistantMsg.content.push({ type: 'text', text: event.data.text })
            }
            setState((prev) => ({
              ...prev,
              messages: [...prev.messages.filter((m) => m.id !== assistantMsg.id), assistantMsg],
            }))
            break
          }
          case 'tool_call_start': {
            assistantMsg.content.push({
              type: 'tool_call',
              id: event.data.id,
              name: event.data.name,
              args: {},
            })
            setState((prev) => ({
              ...prev,
              messages: [...prev.messages.filter((m) => m.id !== assistantMsg.id), assistantMsg],
            }))
            break
          }
          case 'tool_call_awaiting_approval': {
            setState((prev) => ({
              ...prev,
              pendingToolCall: {
                id: event.data.id,
                name: event.data.name,
                args: event.data.args,
              },
            }))
            break
          }
          case 'tool_call_completed': {
            assistantMsg.content.push({
              type: 'tool_result',
              id: event.data.id,
              name: '',
              result: event.data.result,
            })
            setState((prev) => ({
              ...prev,
              pendingToolCall: null,
              messages: [...prev.messages.filter((m) => m.id !== assistantMsg.id), assistantMsg],
            }))
            break
          }
          case 'tool_call_denied': {
            setState((prev) => ({ ...prev, pendingToolCall: null }))
            break
          }
          case 'error': {
            setState((prev) => ({ ...prev, error: event.data.message }))
            break
          }
          case 'status': {
            if (event.data.status === 'idle') {
              setState((prev) => ({ ...prev, isLoading: false }))
            }
            break
          }
        }
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages.filter((m) => m.id !== assistantMsg.id), assistantMsg],
        isLoading: false,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState((prev) => ({ ...prev, error: msg, isLoading: false }))
    }
  }, [sessionId, state.isLoading])

  const approveTool = useCallback(async (toolCallId: string) => {
    try {
      await client.approveToolCall(sessionId, toolCallId)
      setState((prev) => ({ ...prev, pendingToolCall: null }))
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }, [sessionId])

  const denyTool = useCallback(async (toolCallId: string) => {
    try {
      await client.denyToolCall(sessionId, toolCallId)
      setState((prev) => ({ ...prev, pendingToolCall: null }))
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }, [sessionId])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setState((prev) => ({ ...prev, isLoading: false }))
  }, [])

  return {
    ...state,
    sendMessage,
    approveTool,
    denyTool,
    stop,
  }
}
// Bridge between SSE stream and reducer — handles all async I/O
// No rendering logic, only event → action mapping

import { useCallback, useReducer, useRef } from 'react'
import { client } from '@/api/client'
import type { SSEEvent } from '@superagent/core'
import { chatReducer } from '../state/reducer'
import type { ChatState } from '../types'

const INITIAL_STATE: ChatState = {
  turns: [],
  isLoading: false,
  error: null,
}

export function useAgentChat(sessionId: string) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || state.isLoading) return

    const turnId = crypto.randomUUID()
    const userId = crypto.randomUUID()

    dispatch({ type: 'TURN_START', userId, userText: text, turnId })

    try {
      const events = client.chat(sessionId, text)

      for await (const event of events) {
        switch (event.type) {
          case 'text_delta':
            dispatch({ type: 'CONTENT_APPEND', turnId, content: { type: 'text', text: event.data.text } })
            break

          case 'reasoning_delta':
            dispatch({ type: 'CONTENT_APPEND', turnId, content: { type: 'reasoning', text: event.data.text } })
            break

          case 'tool_call_start':
            dispatch({ type: 'TOOL_CALL_START', turnId, callId: event.data.id, name: event.data.name })
            break

          case 'tool_call_awaiting_approval':
            dispatch({ type: 'TOOL_CALL_ARGS', turnId, callId: event.data.id, args: event.data.args })
            dispatch({ type: 'TOOL_CALL_STATUS', turnId, callId: event.data.id, status: 'awaiting_approval' })
            break

          case 'tool_call_completed':
            dispatch({
              type: 'TOOL_CALL_STATUS',
              turnId,
              callId: event.data.id,
              status: 'completed',
              result: event.data.result,
            })
            break

          case 'tool_call_denied':
            dispatch({ type: 'TOOL_CALL_STATUS', turnId, callId: event.data.id, status: 'denied' })
            break

          case 'tool_call_failed':
            dispatch({
              type: 'TOOL_CALL_STATUS',
              turnId,
              callId: event.data.id,
              status: 'failed',
              error: event.data.error,
            })
            break

          case 'error':
            dispatch({ type: 'ERROR', message: event.data.message })
            return

          case 'status':
            if (event.data.status === 'idle') {
              dispatch({ type: 'TURN_END' })
            }
            break
        }
      }

      dispatch({ type: 'TURN_END' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'ERROR', message: msg })
    }
  }, [sessionId, state.isLoading])

  const approveTool = useCallback(async (toolCallId: string) => {
    try {
      await client.approveToolCall(sessionId, toolCallId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'ERROR', message: msg })
    }
  }, [sessionId])

  const denyTool = useCallback(async (toolCallId: string) => {
    try {
      await client.denyToolCall(sessionId, toolCallId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'ERROR', message: msg })
    }
  }, [sessionId])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'TURN_END' })
  }, [])

  return {
    turns: state.turns,
    isLoading: state.isLoading,
    error: state.error,
    sendMessage,
    approveTool,
    denyTool,
    stop,
  }
}

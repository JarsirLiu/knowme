import type { FastifyReply } from 'fastify'
import { run, user, assistant, system, type AgentInputItem, type RunStreamEvent } from '@openai/agents'
import { createCodingAgent } from '@superagent/agent'
import { setupSSEHeaders, sendSSE } from '../utils/sse.js'
import { prisma } from '../db/client.js'
import { ToolApprovalService } from './tool-approval.js'

export class ChatService {
  private approvalService: ToolApprovalService

  constructor(approvalService: ToolApprovalService) {
    this.approvalService = approvalService
  }

  async handleChat(sessionId: string, message: string, reply: FastifyReply) {
    setupSSEHeaders(reply)

    try {
      const session = await prisma.session.findUnique({ where: { id: sessionId } })
      if (!session) {
        sendSSE(reply, { type: 'error', data: { message: `Session not found: ${sessionId}` } })
        reply.raw.end()
        return
      }

      process.env.SUPERAGENT_AUTO_APPROVE_SHELL = 'true'
      const { agent, cfg } = createCodingAgent()
      console.log(`[CHAT] Model: ${cfg.model}, BaseURL: ${cfg.baseURL}`)

      const history = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      })

      const input: AgentInputItem[] = []
      for (const msg of history) {
        const role = msg.role as 'user' | 'assistant' | 'system'
        const content = msg.content
        if (role === 'user') input.push(user(content))
        else if (role === 'assistant') input.push(assistant(content))
        else if (role === 'system') input.push(system(content))
      }
      input.push(user(message))

      await prisma.message.create({
        data: { sessionId, role: 'user', content: message },
      })

      sendSSE(reply, { type: 'status', data: { status: 'thinking' } })

      const result = await run(agent, input, {
        maxTurns: cfg.maxTurns,
        stream: true,
      }) as AsyncIterable<RunStreamEvent>

      let fullResponse = ''
      let fullReasoning = ''

      for await (const event of result) {
        if (event.type === 'raw_model_stream_event') {
          const data = (event as { data: { type: string; delta?: string; itemId?: string } }).data

          if (data.type === 'output_text_delta' && data.delta) {
            fullResponse += data.delta
            sendSSE(reply, { type: 'text_delta', data: { text: data.delta } })
          }

          if (data.type === 'model') {
            const modelEvent = (event as { data: { event?: { choices?: Array<{ delta?: { reasoning?: string } }> } } }).data
            const reasoningDelta = modelEvent.event?.choices?.[0]?.delta?.reasoning
            if (reasoningDelta) {
              fullReasoning += reasoningDelta
              sendSSE(reply, { type: 'reasoning_delta', data: { text: reasoningDelta } })
            }
          }
        }

        if (event.type === 'run_item_stream_event') {
          const item = (event as { item?: { type: string; rawItem?: unknown } }).item
          if (!item) continue

          if (event.name === 'tool_called' && item.type === 'tool_call_item') {
            const tc = item as unknown as { rawItem: { callId: string; name: string } }
            sendSSE(reply, {
              type: 'tool_call_start',
              data: { id: tc.rawItem.callId, name: tc.rawItem.name },
            })
            await this.approvalService.saveToolCall({
              id: tc.rawItem.callId,
              sessionId,
              name: tc.rawItem.name,
              args: '{}',
              status: 'running',
            })
          }

          if (event.name === 'tool_approval_requested' && item.type === 'tool_approval_item') {
            const approvalItem = item as unknown as {
              rawItem: { callId?: string; id?: string; name?: string; arguments?: string }
              name?: string
              arguments?: string
            }
            const callId = approvalItem.rawItem.callId || approvalItem.rawItem.id || 'unknown'
            const name = approvalItem.name || approvalItem.rawItem.name || 'unknown'
            const argsStr = approvalItem.arguments || '{}'
            let args: unknown
            try { args = JSON.parse(argsStr) } catch { args = argsStr }

            sendSSE(reply, {
              type: 'tool_call_awaiting_approval',
              data: { id: callId, name, args },
            })

            await this.approvalService.updateToolCall(callId, { status: 'awaiting_approval' })

            const approved = await this.approvalService.requestApproval(callId)
            if (!approved) {
              sendSSE(reply, { type: 'tool_call_denied', data: { id: callId } })
              await this.approvalService.updateToolCall(callId, { status: 'denied' })
            }
          }

          if (event.name === 'tool_output' && item.type === 'tool_call_output_item') {
            const output = item as unknown as { rawItem: { callId: string; output: unknown } }
            sendSSE(reply, {
              type: 'tool_call_completed',
              data: { id: output.rawItem.callId, result: output.rawItem.output },
            })
            await this.approvalService.updateToolCall(output.rawItem.callId, {
              status: 'completed',
              result: output.rawItem.output,
            })
          }
        }
      }

      if (fullResponse) {
        await prisma.message.create({
          data: { sessionId, role: 'assistant', content: fullResponse },
        })
      }

      sendSSE(reply, { type: 'status', data: { status: 'idle' } })
      reply.raw.end()
    } catch (err) {
      console.error('[CHAT ERROR] type:', typeof err)
      console.error('[CHAT ERROR] message:', err instanceof Error ? err.message : String(err))
      console.error('[CHAT ERROR] stack:', err instanceof Error ? err.stack : 'N/A')
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>
        if ('status' in e) console.error('[CHAT ERROR] status:', e.status)
        if ('error' in e) console.error('[CHAT ERROR] provider error:', JSON.stringify(e.error))
        if ('response' in e) console.error('[CHAT ERROR] response:', JSON.stringify(e.response))
      }
      const msg = err instanceof Error ? err.message : String(err)
      sendSSE(reply, { type: 'error', data: { message: msg } })
      reply.raw.end()
    }
  }
}

import type { FastifyReply } from 'fastify'
import type { SSEEvent } from '@cloudagent/core'

export function sendSSE(reply: FastifyReply, event: SSEEvent): void {
  reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
}

export function setupSSEHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
}

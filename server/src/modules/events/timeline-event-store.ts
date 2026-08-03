import type { Prisma } from '@prisma/client'
import type {
  AnyTimelineEvent,
  TimelineEventPayloadMap,
  TimelineEventType,
} from '@superagent/core'
import { prisma } from '../../db/client.js'
import { TimelineEventHub } from './timeline-event-hub.js'

type TimelineTransaction = Prisma.TransactionClient

export class TimelineEventStore {
  constructor(private readonly hub: TimelineEventHub = new TimelineEventHub()) {}

  get eventHub(): TimelineEventHub {
    return this.hub
  }

  publish(event: AnyTimelineEvent): void {
    this.hub.publish(event)
  }

  async append<T extends TimelineEventType>(
    conversationId: string,
    runId: string | null,
    type: T,
    data: TimelineEventPayloadMap[T],
  ): Promise<AnyTimelineEvent> {
    const event = await prisma.$transaction((tx) =>
      appendTimelineEvent(tx, conversationId, runId, type, data),
    )
    this.publish(event)
    return event
  }

  async appendOwned<T extends TimelineEventType>(
    conversationId: string,
    runId: string,
    leaseOwner: string,
    type: T,
    data: TimelineEventPayloadMap[T],
  ): Promise<AnyTimelineEvent> {
    const event = await prisma.$transaction(async (tx) => {
      const ownedRun = await tx.agentRun.findFirst({
        where: { id: runId, status: 'running', leaseOwner },
        select: { id: true },
      })
      if (!ownedRun) throw new Error(`Run lease lost: ${runId}`)
      return appendTimelineEvent(tx, conversationId, runId, type, data)
    })
    this.publish(event)
    return event
  }

  async list(conversationId: string, runId?: string): Promise<AnyTimelineEvent[]> {
    const rows = await prisma.timelineEvent.findMany({
      where: {
        conversationId,
        ...(runId ? { runId } : {}),
      },
      orderBy: { sequence: 'asc' },
    })
    return rows.map(toTimelineEvent)
  }

  async listAfter(conversationId: string, sequence: number): Promise<AnyTimelineEvent[]> {
    const rows = await prisma.timelineEvent.findMany({
      where: { conversationId, sequence: { gt: sequence } },
      orderBy: { sequence: 'asc' },
    })
    return rows.map(toTimelineEvent)
  }

  async findById(conversationId: string, id: string): Promise<AnyTimelineEvent | undefined> {
    const row = await prisma.timelineEvent.findFirst({ where: { conversationId, id } })
    return row ? toTimelineEvent(row) : undefined
  }
}

export async function appendTimelineEvent<T extends TimelineEventType>(
  tx: TimelineTransaction,
  conversationId: string,
  runId: string | null,
  type: T,
  data: TimelineEventPayloadMap[T],
): Promise<AnyTimelineEvent> {
  const counter = await tx.timelineSequence.upsert({
    where: { conversationId },
    create: { conversationId, nextSequence: 1 },
    update: { nextSequence: { increment: 1 } },
    select: { nextSequence: true },
  })

  const row = await tx.timelineEvent.create({
    data: {
      conversationId,
      runId,
      sequence: counter.nextSequence,
      type,
      payload: JSON.stringify(data),
    },
  })

  return toTimelineEvent(row)
}

function toTimelineEvent(row: {
  id: string
  conversationId: string
  runId: string | null
  sequence: number
  type: string
  payload: string
  createdAt: Date
}): AnyTimelineEvent {
  return {
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId,
    sequence: row.sequence,
    type: row.type as TimelineEventType,
    data: JSON.parse(row.payload) as never,
    createdAt: row.createdAt.toISOString(),
  }
}

import { prisma } from '../../db/client.js'

export class RunEventStore {
  async append(runId: string, type: string, payload: unknown) {
    const last = await prisma.runEvent.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
    })

    await prisma.runEvent.create({
      data: {
        runId,
        sequence: (last?.sequence ?? 0) + 1,
        type,
        payload: JSON.stringify(payload),
      },
    })
  }
}

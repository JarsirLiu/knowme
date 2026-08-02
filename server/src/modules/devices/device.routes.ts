import type { FastifyInstance } from 'fastify'
import type { DeviceService } from './device.service.js'

export function registerDeviceRoutes(app: FastifyInstance, deviceService: DeviceService) {
  app.get('/api/devices', async (_req, reply) => {
    const devices = await deviceService.list()
    return reply.send({ devices })
  })

  app.post('/api/devices', async (req, reply) => {
    const body = req.body as { name: string; endpoint: string; apiKey: string }
    const device = await deviceService.register(body)
    return reply.send({ device })
  })
}

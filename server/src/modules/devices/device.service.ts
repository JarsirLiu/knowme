import { prisma } from '../../db/client.js'

export class DeviceService {
  async list() {
    return prisma.device.findMany()
  }

  async register(data: { name: string; endpoint: string; apiKey: string }) {
    return prisma.device.create({
      data: { ...data, status: 'offline' },
    })
  }

  async remove(id: string) {
    await prisma.device.delete({ where: { id } })
  }

  async updateStatus(id: string, status: 'online' | 'offline') {
    return prisma.device.update({ where: { id }, data: { status } })
  }
}

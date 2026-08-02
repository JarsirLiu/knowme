import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../db/client.js'

export class ProjectService {
  async list() {
    return prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
    })
  }

  async create(data: { name: string; rootPath: string }) {
    const rootPath = path.resolve(data.rootPath)
    const stat = fs.statSync(rootPath, { throwIfNoEntry: false })
    if (!stat?.isDirectory()) {
      throw new Error(`Project root does not exist or is not a directory: ${rootPath}`)
    }

    return prisma.project.create({
      data: {
        name: data.name.trim() || path.basename(rootPath) || 'Local Project',
        rootPath,
      },
    })
  }

  async get(id: string) {
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) throw new Error(`Project not found: ${id}`)
    return project
  }
}

import type { Project } from '@prisma/client'
import { prisma } from '../../db/client.js'

export interface ProjectRepository {
  list(): Promise<Project[]>
  create(data: { name: string; rootPath: string }): Promise<Project>
  get(id: string): Promise<Project | null>
}

export class PrismaProjectRepository implements ProjectRepository {
  list() {
    return prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
    })
  }

  create(data: { name: string; rootPath: string }) {
    return prisma.project.create({ data })
  }

  get(id: string) {
    return prisma.project.findUnique({ where: { id } })
  }
}

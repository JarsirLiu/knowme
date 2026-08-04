import path from 'node:path'
import {
  PrismaProjectRepository,
  type ProjectRepository,
} from './project-repository.js'
import { ProjectPathValidator } from './project-path-validator.js'

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository = new PrismaProjectRepository(),
    private readonly pathValidator: ProjectPathValidator = new ProjectPathValidator(),
  ) {}

  async list() {
    return this.repository.list()
  }

  async create(data: { name: string; rootPath: string }) {
    const rootPath = this.pathValidator.resolveDirectory(data.rootPath)
    return this.repository.create({
      name: data.name.trim() || path.basename(rootPath) || 'Local Project',
      rootPath,
    })
  }

  async get(id: string) {
    const project = await this.repository.get(id)
    if (!project) throw new Error(`Project not found: ${id}`)
    return project
  }
}

import { loadSkills, listReferenceFiles, listScriptFiles } from '@superagent/agent'
import type { SkillInfo } from '@superagent/core'
import type { ProjectService } from './project.service.js'

export class SkillService {
  constructor(private readonly projectService: ProjectService) {}

  async listForProject(projectId: string): Promise<SkillInfo[]> {
    const project = await this.projectService.get(projectId)
    const skills = await loadSkills(project.rootPath)
    return Promise.all(skills.map(async (skill) => ({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      version: skill.frontmatter.version ?? '1.0.0',
      hasReferences: (await listReferenceFiles(skill.dir)).length > 0,
      hasScripts: (await listScriptFiles(skill.dir)).length > 0,
    })))
  }
}
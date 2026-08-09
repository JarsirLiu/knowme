import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { CloudagentPaths } from '@superagent/core/paths'
import { parseSkillFile, SKILL_FILENAME } from './parser.js'
import type { SkillMetadata } from './types.js'

export type SkillScope = 'project' | 'user' | 'system'

/** Resolve the skills directory for a scope. Defaults to project scope. */
export function skillsDir(workspace: string, scope: SkillScope = 'project'): string {
  const paths = new CloudagentPaths()
  switch (scope) {
    case 'project':
      return paths.projectSkillsDir(workspace)
    case 'user':
      return paths.userSkillsDir()
    case 'system':
      return paths.systemSkillsDir()
  }
}

export function skillDir(workspace: string, skillId: string, scope: SkillScope = 'project'): string {
  return join(skillsDir(workspace, scope), skillId)
}

/**
 * Load all skills visible to a workspace, merging the project, user, and system
 * layers. Higher-priority layers override lower ones by skill name:
 * project > user > system. Each returned skill carries its resolved `dir`.
 */
export async function loadSkills(workspace: string): Promise<SkillMetadata[]> {
  const paths = new CloudagentPaths()
  const byName = new Map<string, SkillMetadata>()
  for (const base of paths.allSkillDirs(workspace)) {
    for (const skill of await readSkillsFromDir(base)) {
      const key = skill.frontmatter.name.toLowerCase()
      if (!byName.has(key)) byName.set(key, skill)
    }
  }
  return [...byName.values()]
}

async function readSkillsFromDir(base: string): Promise<SkillMetadata[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(base, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: SkillMetadata[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(base, entry.name)
    let raw: string
    try {
      raw = await fs.readFile(join(dir, SKILL_FILENAME), 'utf8')
    } catch {
      continue
    }
    const parsed = parseSkillFile(raw)
    if (!parsed) continue
    skills.push({ ...parsed, dir })
  }
  return skills
}

export async function readSkillByName(workspace: string, name: string): Promise<SkillMetadata | undefined> {
  const skills = await loadSkills(workspace)
  return skills.find((s) => s.frontmatter.name.toLowerCase() === name.toLowerCase())
}

export async function listReferenceFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(join(dir, 'references'), { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function listScriptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(join(dir, 'scripts'), { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}
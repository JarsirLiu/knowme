import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseSkillFile, SKILL_FILENAME } from './parser.js'
import type { SkillMetadata } from './types.js'

export const SKILLS_DIR_NAME = '.superagent/skills'

export function skillsDir(workspace: string): string {
  return join(workspace, SKILLS_DIR_NAME)
}

export function skillDir(workspace: string, skillId: string): string {
  return join(skillsDir(workspace), skillId)
}

export function skillReferencesDir(workspace: string, skillId: string): string {
  return join(skillDir(workspace, skillId), 'references')
}

export function skillScriptsDir(workspace: string, skillId: string): string {
  return join(skillDir(workspace, skillId), 'scripts')
}

export async function loadSkills(workspace: string): Promise<SkillMetadata[]> {
  const base = skillsDir(workspace)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(base, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: SkillMetadata[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = skillDir(workspace, entry.name)
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

export async function readReferenceFile(workspace: string, skillId: string, file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(join(skillReferencesDir(workspace, skillId), file), 'utf8')
  } catch {
    return undefined
  }
}

export async function listReferenceFiles(workspace: string, skillId: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(skillReferencesDir(workspace, skillId), { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function listScriptFiles(workspace: string, skillId: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(skillScriptsDir(workspace, skillId), { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}
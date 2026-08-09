import { tool } from '@openai/agents'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { loadSkills, skillDir, listReferenceFiles, listScriptFiles } from './loader.js'
import type { SkillScope } from './loader.js'
import { parseSkillFile, serializeSkillFile, SKILL_FILENAME } from './parser.js'
import type { SkillFrontmatter, SkillPackage } from './types.js'

export function createSkillTools(workspace: string) {
  const listSkills = tool({
    name: 'list_skills',
    description: 'List all installed skills in the current workspace.',
    parameters: z.object({}),
    execute: async () => {
      const skills = await loadSkills(workspace)
      if (skills.length === 0) return 'No skills installed.'
      const lines = await Promise.all(skills.map(async (s) => {
        const refs = await listReferenceFiles(s.dir)
        const scripts = await listScriptFiles(s.dir)
        const extras = [
          refs.length > 0 ? `${refs.length} references` : '',
          scripts.length > 0 ? `${scripts.length} scripts` : '',
        ].filter(Boolean).join(', ')
        return `- ${s.frontmatter.name} (${s.frontmatter.version}): ${s.frontmatter.description}${extras ? ` [${extras}]` : ''}`
      }))
      return lines.join('\n')
    },
  })

  const installSkill = tool({
    name: 'install_skill',
    description: 'Download a skill package JSON from a URL and install it. The skill takes effect on the next turn.',
    parameters: z.object({
      url: z.string().url().describe('URL pointing to a skill package JSON (must contain skillId + frontmatter + body)'),
      scope: z.enum(['project', 'user']).default('project').describe('Where to install: project (default, shared with team) or user (global, available across projects)'),
    }),
    execute: async ({ url, scope }) => {
      let res: Response
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return `Download failed: HTTP ${res.status}`
      } catch (err) {
        return `Download failed: ${err instanceof Error ? err.message : String(err)}`
      }
      let pkg: SkillPackage
      try {
        pkg = await res.json()
      } catch {
        return 'Invalid skill package: not valid JSON.'
      }
      if (!pkg.skillId || !pkg.frontmatter?.name || !pkg.frontmatter?.description || typeof pkg.body !== 'string') {
        return 'Invalid skill package: must contain "skillId", "frontmatter.name", "frontmatter.description", and "body".'
      }
      const dir = skillDir(workspace, pkg.skillId, scope)
      const skillMd = serializeSkillFile({
        name: pkg.frontmatter.name,
        description: pkg.frontmatter.description,
        version: pkg.frontmatter.version,
        body: pkg.body,
      })
      try {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(join(dir, SKILL_FILENAME), skillMd, 'utf8')
      } catch (err) {
        return `Failed to write skill files: ${err instanceof Error ? err.message : String(err)}`
      }
      const scopeLabel = scope === 'user' ? 'globally' : 'in this project'
      return `Skill "${pkg.frontmatter.name}" (${pkg.skillId}) installed ${scopeLabel}. Use it by typing $${pkg.frontmatter.name} in your message.`
    },
  })

  const createSkill = tool({
    name: 'create_skill',
    description: 'Create a new skill by writing SKILL.md. The skill takes effect on the next turn.',
    parameters: z.object({
      skillId: z.string().min(1).describe('Unique skill identifier (used as directory name)'),
      name: z.string().min(1).describe('Skill name (used as $name mention)'),
      description: z.string().describe('What this skill does'),
      instructions: z.string().min(1).describe('Markdown instructions injected when the skill is mentioned'),
      version: z.string().default('1.0.0'),
      scope: z.enum(['project', 'user']).default('project').describe('Where to create: project (default, shared with team) or user (global, available across projects)'),
    }),
    execute: async ({ skillId, name, description, instructions, version, scope }) => {
      const dir = skillDir(workspace, skillId, scope)
      const parsed = parseSkillFile(serializeSkillFile({ name, description, version, body: instructions }))
      if (!parsed) return 'Failed to create skill: invalid frontmatter.'
      try {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(join(dir, SKILL_FILENAME), serializeSkillFile({ name, description, version, body: instructions }), 'utf8')
      } catch (err) {
        return `Failed to create skill: ${err instanceof Error ? err.message : String(err)}`
      }
      const scopeLabel = scope === 'user' ? 'globally' : 'in this project'
      return `Skill "${name}" (${skillId}) created ${scopeLabel}. Use it by typing $${name} in your message.`
    },
  })

  const readSkillRef = tool({
    name: 'read_skill_reference',
    description: 'Read a reference file from an installed skill\'s references/ directory.',
    parameters: z.object({
      skillId: z.string().min(1).describe('Skill identifier (directory name)'),
      file: z.string().min(1).describe('Reference file name'),
    }),
    execute: async ({ skillId, file }) => {
      const skills = await loadSkills(workspace)
      const skill = skills.find((s) => s.frontmatter.name.toLowerCase() === skillId.toLowerCase())
      if (!skill) return `Skill "${skillId}" not found.`
      const refDir = join(skill.dir, 'references')
      try {
        return await fs.readFile(join(refDir, file), 'utf8')
      } catch {
        return `File "${file}" not found in skill "${skillId}" references/.`
      }
    },
  })

  return [listSkills, installSkill, createSkill, readSkillRef]
}
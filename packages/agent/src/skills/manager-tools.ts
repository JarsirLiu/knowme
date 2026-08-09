import { tool } from '@openai/agents'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { skillDir } from './loader.js'
import { serializeSkillFile, SKILL_FILENAME } from './parser.js'

export function createSkillTools(workspace: string) {
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
      const content = serializeSkillFile({ name, description, version, body: instructions })
      try {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(join(dir, SKILL_FILENAME), content, 'utf8')
      } catch (err) {
        return `Failed to create skill: ${err instanceof Error ? err.message : String(err)}`
      }
      const scopeLabel = scope === 'user' ? 'globally' : 'in this project'
      return `Skill "${name}" (${skillId}) created ${scopeLabel}. Use it by typing $${name} in your message.`
    },
  })

  return [createSkill]
}
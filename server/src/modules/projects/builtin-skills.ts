import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { CloudagentPaths } from '@cloudagent/core/paths'
import { SKILL_FILENAME } from '@cloudagent/agent'

const SKILL_CREATOR_MD =
`---
name: skill-creator
description: Guide for creating skills. Use this skill when users want to create a new skill that extends the agent with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill guides you through creating a new skill.

## About Skills

A skill is a SKILL.md file with YAML frontmatter stored in a skill directory. When the user types \`$<skill-name>\` in their message, the skill's content is loaded into context.

## Skill Creation Process

1. Understand what the user wants with concrete examples
2. Design the skill: name, description, and markdown instructions
3. Ask the user where to put the skill: project (shared with team) or user (global, available across projects)
4. Create the skill using \`create_skill\` tool with the appropriate scope
5. Tell the user how to use it (\`$技能名\`)

### Step 1: Understand

Ask the user what they want the skill to do. Keep questions focused:
- "What should this skill help with?"
- "Can you give an example of how you'd use it?"
- "What should the skill name be? (lowercase, hyphens allowed)"

Ask one question at a time. Don't overwhelm the user.

### Step 2: Design

Based on the user's answers, design:
- **name**: lowercase letters, digits, hyphens
- **description**: short, clear, when to use this skill
- **instructions**: markdown body telling the agent what to do. Use imperative sentences.

### Step 3: Ask Scope

Ask where to put the skill:
- **project scope**: saved in \`.cloudagent/skills/\` inside the project, committed to the repo, shared with the team
- **user scope**: saved in \`~/.cloudagent/skills/\`, available across all projects

If the user has no preference, default to project scope.

### Step 4: Create

Call the \`create_skill\` tool with the designed values and scope:

- \`skillId\`: same as name (directory name)
- \`name\`: the skill name
- \`description\`: one-line description
- \`instructions\`: markdown body
- \`scope\`: "project" or "user"

### Step 5: Tell the User

Tell the user they can now use the skill by typing \`$<name>\` in their message.

### Step 6: (Optional) Install from URL

If the user wants to install a skill from a URL, download the skill package JSON using \`web_fetch\`, then call \`create_skill\` with the extracted fields.`

interface BuiltinSkillDef {
  skillId: string
  content: string
}

const BUILTIN_SKILLS: BuiltinSkillDef[] = [
  { skillId: 'skill-creator', content: SKILL_CREATOR_MD },
]

export async function seedBuiltinSkills(): Promise<void> {
  const paths = new CloudagentPaths()
  const base = paths.systemSkillsDir()
  for (const { skillId, content } of BUILTIN_SKILLS) {
    const dir = join(base, skillId)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, SKILL_FILENAME), content, 'utf8')
  }
}
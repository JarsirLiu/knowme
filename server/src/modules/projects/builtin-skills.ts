import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { SKILL_FILENAME } from '@superagent/agent'

const SKILL_CREATOR_MD =
`---
name: skill-creator
description: Guide for creating skills. Use this skill when users want to create a new skill that extends the agent with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill guides you through creating a new skill.

## About Skills

A skill is a SKILL.md file with YAML frontmatter stored in \`.superagent/skills/<skill-name>/\`. When the user types \`$<skill-name>\` in their message, the skill's content is loaded into context.

## Skill Creation Process

1. Understand what the user wants with concrete examples
2. Design the skill: name, description, and markdown instructions
3. Create the skill using \`create_skill\` tool
4. Tell the user how to use it (\`$技能名\`)

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

### Step 3: Create

Call the \`create_skill\` tool with the designed values:

- \`skillId\`: same as name (directory name)
- \`name\`: the skill name
- \`description\`: one-line description
- \`instructions\`: markdown body

### Step 4: Tell the User

Tell the user they can now use the skill by typing \`$<name>\` in their message.`

function seedDir(workspace: string, skillId: string): string {
  return join(workspace, '.superagent', 'skills', skillId)
}

export async function seedBuiltinSkills(workspace: string): Promise<void> {
  await fs.mkdir(seedDir(workspace, 'skill-creator'), { recursive: true })
  await fs.writeFile(join(seedDir(workspace, 'skill-creator'), SKILL_FILENAME), SKILL_CREATOR_MD, 'utf8')
}
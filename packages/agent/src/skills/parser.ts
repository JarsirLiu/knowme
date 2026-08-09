import type { SkillFrontmatter, SkillMetadata } from './types.js'

export const SKILL_FILENAME = 'SKILL.md'

export interface ParseResult {
  frontmatter: SkillFrontmatter | undefined
  body: string
}

export function splitFrontmatter(raw: string): ParseResult {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) {
    return { frontmatter: undefined, body: trimmed.trim() }
  }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: undefined, body: trimmed.trim() }
  }
  const frontYaml = trimmed.slice(3, end)
  const body = trimmed.slice(end + 4).trim()
  return { frontmatter: parseFrontmatter(frontYaml), body }
}

function parseFrontmatter(yaml: string): SkillFrontmatter | undefined {
  let name: string | undefined
  let description: string | undefined
  let version: string | undefined

  for (const line of yaml.split('\n')) {
    const noComment = line.split('#')[0].trim()
    if (!noComment) continue
    const colon = noComment.indexOf(':')
    if (colon === -1) continue
    const key = noComment.slice(0, colon).trim()
    let value = noComment.slice(colon + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    if (key === 'name') name = value
    else if (key === 'description') description = value
    else if (key === 'version') version = value
  }

  if (!name || name.length > 64) return undefined
  if (!description || description.length > 1024) return undefined
  return { name, description, version: version || '1.0.0' }
}

export function parseSkillFile(raw: string): SkillMetadata | undefined {
  const { frontmatter, body } = splitFrontmatter(raw)
  if (!frontmatter || !body) return undefined
  return { frontmatter, body, raw, dir: '' }
}

export function serializeSkillFile(fields: { name: string; description: string; version?: string; body: string }): string {
  return [
    '---',
    `name: ${fields.name}`,
    `description: ${fields.description}`,
    fields.version ? `version: ${fields.version}` : '',
    '---',
    '',
    fields.body,
  ].filter(Boolean).join('\n')
}
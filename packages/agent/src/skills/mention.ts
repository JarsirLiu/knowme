import type { SkillMetadata } from './types.js'

const MENTION_RE = /\$([a-z0-9][a-z0-9-]*)(?![a-z0-9-])/gi

export function extractSkillMentions(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(MENTION_RE)) {
    names.add(match[1].toLowerCase())
  }
  return [...names]
}

export function resolveMentions(
  text: string,
  skills: SkillMetadata[],
): { mentioned: SkillMetadata[]; cleaned: string } {
  const mentions = extractSkillMentions(text)
  const byName = new Map(skills.map((s) => [s.frontmatter.name.toLowerCase(), s]))
  const seen = new Set<string>()
  const mentioned = mentions
    .map((name) => byName.get(name))
    .filter((s): s is SkillMetadata => Boolean(s))
    .filter((s) => {
      if (seen.has(s.frontmatter.name)) return false
      seen.add(s.frontmatter.name)
      return true
    })

  const cleaned = text.replace(MENTION_RE, (match, name: string) => {
    return byName.has(name.toLowerCase()) ? '' : match
  })

  return { mentioned, cleaned: cleaned.replace(/\s{2,}/g, ' ').trim() }
}
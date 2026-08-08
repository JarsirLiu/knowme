export interface SkillFrontmatter {
  name: string
  description: string
  version?: string
}

export interface SkillMetadata {
  frontmatter: SkillFrontmatter
  body: string
  raw: string
  dir: string
}

export interface SkillMention {
  name: string
  metadata: SkillMetadata
}

export interface SkillPackage {
  skillId: string
  frontmatter: SkillFrontmatter
  body: string
}
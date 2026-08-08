import type { SkillInfo } from '@superagent/core'

export type CmdItem = {
  type: 'system' | 'skill'
  label: string
  description: string
  insert: string
}

export const SYSTEM_COMMANDS: CmdItem[] = [
  { type: 'system', label: '/compact', description: '压缩上下文，节省 token', insert: '/compact' },
]

export function buildCommandList(skills: SkillInfo[]): CmdItem[] {
  return [
    ...SYSTEM_COMMANDS,
    ...skills.map((s) => ({
      type: 'skill' as const,
      label: `$${s.name}`,
      description: s.description,
      insert: `$${s.name}`,
    })),
  ]
}
import type { SkillInfo } from '@superagent/core'

export type CmdItem = {
  type: 'system' | 'skill'
  group: 'system' | 'skill'
  label: string
  description: string
  insert: string
  selectFrom?: number
}

export const GROUP_LABELS: Record<CmdItem['group'], string> = {
  system: '系统命令',
  skill: '技能',
}

export const SYSTEM_COMMANDS: CmdItem[] = [
  { type: 'system', group: 'system', label: '/compact', description: '压缩上下文，节省 token', insert: '/compact' },
  { type: 'skill', group: 'skill', label: '/makeskill', description: '创建新技能，让 AI 引导你完成', insert: '$skill-creator 描述你想创建的新技能', selectFrom: 14 },
]

export function buildCommandList(skills: SkillInfo[]): CmdItem[] {
  return [
    ...SYSTEM_COMMANDS,
    ...skills.map((s) => ({
      type: 'skill' as const,
      group: 'skill' as const,
      label: `$${s.name}`,
      description: s.description,
      insert: `$${s.name}`,
    })),
  ]
}
import type { SkillInfo } from '@superagent/core'

export type CmdItem = {
  type: 'system' | 'skill'
  group: 'system' | 'skill-create' | 'installed'
  label: string
  description: string
  insert: string
}

export const GROUP_LABELS: Record<CmdItem['group'], string> = {
  system: '系统命令',
  'skill-create': '创建技能',
  installed: '已安装技能',
}

export const SYSTEM_COMMANDS: CmdItem[] = [
  { type: 'system', group: 'system', label: '/compact', description: '压缩上下文，节省 token', insert: '/compact' },
  { type: 'system', group: 'skill-create', label: '/makeskill', description: '创建新技能，让 AI 引导你完成', insert: '/makeskill' },
]

export const SKILL_CREATOR_PROMPT =
'我想创建一个新技能，请帮我设计并创建它。\n' +
'技能是一个目录，包含 SKILL.md（YAML frontmatter + Markdown 指令），可选 references/ 和 scripts/ 子目录。\n' +
'请按以下流程引导我：\n' +
'1. 先了解我想要的技能：功能、何时使用、name（小写字母数字连字符）和 description。\n' +
'2. 设计 SKILL.md 的 frontmatter（name、description）和正文指令，正文用祈使句，简洁可执行。\n' +
'3. 用 create_skill 工具在项目 .superagent/skills/ 下创建技能。\n' +
'4. 创建后告诉我如何使用（输入 $技能名 触发）。\n' +
'请逐步引导，一次只问最关键的问题，不要一次问太多。'

export function buildCommandList(skills: SkillInfo[]): CmdItem[] {
  return [
    ...SYSTEM_COMMANDS,
    ...skills.map((s) => ({
      type: 'skill' as const,
      group: 'installed' as const,
      label: `$${s.name}`,
      description: s.description,
      insert: `$${s.name}`,
    })),
  ]
}
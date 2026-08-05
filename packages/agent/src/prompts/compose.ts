import type { PromptConfig, PromptFragment } from './types.js'
import { identity } from './templates/identity.js'
import { personality } from './templates/personality.js'
import { preamble } from './templates/preamble.js'
import { planning } from './templates/planning.js'
import { finalAnswer } from './templates/final-answer.js'
import { permissions } from './templates/permissions.js'
import { testing } from './templates/testing.js'
import { agentsMd } from './templates/agents-md.js'

const registry: Record<string, PromptFragment> = {
  personality: { key: 'personality', label: 'Personality', template: personality },
  preamble: { key: 'preamble', label: 'Preamble', template: preamble },
  planning: { key: 'planning', label: 'Planning', template: planning },
  finalAnswer: { key: 'finalAnswer', label: 'Final Answer', template: finalAnswer },
  permissions: { key: 'permissions', label: 'Permissions', template: permissions },
  testing: { key: 'testing', label: 'Testing', template: testing },
  agentsMd: { key: 'agentsMd', label: 'AGENTS.md', template: agentsMd },
}

export function registerFragment(fragment: PromptFragment): void {
  registry[fragment.key] = fragment
}

export function getFragment(key: string): PromptFragment | undefined {
  return registry[key]
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export function composePrompt(config: PromptConfig, vars: Record<string, string>): string {
  const parts: string[] = []

  // Identity is always required
  parts.push(renderTemplate(identity, { name: config.name ?? 'SuperAgent', workspace: vars.workspace, identity_custom: config.identity }))

  // Optional fragments
  if (config.personality) parts.push(renderTemplate(personality, vars))
  if (config.preamble) parts.push(renderTemplate(preamble, vars))
  if (config.planning) parts.push(renderTemplate(planning, vars))
  if (config.finalAnswer) parts.push(renderTemplate(finalAnswer, vars))
  if (config.permissions) {
    parts.push(renderTemplate(permissions, {
      ...vars,
      permissions_description: config.permissions,
      approval_policy: vars.approval_policy ?? 'All commands require approval.',
    }))
  }
  if (config.testing) parts.push(renderTemplate(testing, vars))
  if (config.agentsMd) parts.push(renderTemplate(agentsMd, vars))

  // Custom fragments
  if (config.customFragments) {
    for (const key of config.customFragments) {
      const fragment = registry[key]
      if (fragment) parts.push(renderTemplate(fragment.template, vars))
    }
  }

  return parts.join('\n\n')
}

export type { PromptConfig, PromptFragment }
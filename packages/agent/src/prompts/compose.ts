import type { PromptConfig, PromptFragment } from './types.js'

const registry: Record<string, PromptFragment> = {}

export function registerFragment(fragment: PromptFragment): void {
  registry[fragment.key] = fragment
}

export function getFragment(key: string): PromptFragment | undefined {
  return registry[key]
}

export function composePrompt(config: PromptConfig, vars: Record<string, string>): string {
  const parts: string[] = [config.identity]

  if (config.customFragments) {
    for (const key of config.customFragments) {
      const fragment = registry[key]
      if (fragment) parts.push(fragment.template)
    }
  }

  return parts.join('\n\n')
}

export type { PromptConfig, PromptFragment }
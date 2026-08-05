export interface PromptConfig {
  identity: string
  name?: string
  personality?: string
  preamble?: boolean
  planning?: boolean
  finalAnswer?: boolean
  permissions?: string
  testing?: boolean
  agentsMd?: boolean
  customFragments?: string[]
}

export interface PromptFragment {
  key: string
  label: string
  template: string
}
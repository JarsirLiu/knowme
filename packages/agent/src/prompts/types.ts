export interface PromptConfig {
  identity: string
  customFragments?: string[]
}

export interface PromptFragment {
  key: string
  label: string
  template: string
}
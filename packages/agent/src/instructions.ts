import { mainAgentPrompt } from './prompts/templates/main-agent.js'
import { exploreAgentPrompt } from './prompts/templates/explore-agent.js'

export type AgentType = 'main' | 'explore'

export function getInstructions(type: AgentType = 'main'): string {
  if (type === 'explore') return exploreAgentPrompt()
  return mainAgentPrompt()
}
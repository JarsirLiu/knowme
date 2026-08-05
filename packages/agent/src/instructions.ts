import { mainAgentPrompt } from './prompts/templates/main-agent.js'
import { explorerPrompt } from './prompts/templates/explorer.js'
import { reviewerPrompt } from './prompts/templates/reviewer.js'

export const getInstructions = mainAgentPrompt
export const getExplorerInstructions = explorerPrompt
export const getReviewerInstructions = reviewerPrompt
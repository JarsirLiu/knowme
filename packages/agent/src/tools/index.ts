import type { Tool } from '@openai/agents'
import { chatCompletionsPatchTool, chatCompletionsShellTool } from './chat-completions-tools.js'
import { webFetch } from './web-fetch.js'

export function createTools(cfg: { workspace: string }): Tool[] {
  return [
    chatCompletionsShellTool(cfg.workspace),
    chatCompletionsPatchTool(cfg.workspace),
    webFetch(),
  ]
}

export function createReadOnlyTools(workspace: string): Tool[] {
  return [
    chatCompletionsShellTool(workspace),
  ]
}

export function createReviewTools(workspace: string): Tool[] {
  return createReadOnlyTools(workspace)
}

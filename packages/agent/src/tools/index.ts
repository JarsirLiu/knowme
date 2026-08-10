import type { Tool } from '@openai/agents'
import { chatCompletionsPatchTool, chatCompletionsShellTool } from './chat-completions-tools.js'
import { webFetch } from './web-fetch.js'

export function createTools(cfg: { workspace: string }, opts?: { excludeEdit?: boolean }): Tool[] {
  const tools: Tool[] = [
    chatCompletionsShellTool(cfg.workspace),
    ...(opts?.excludeEdit ? [] : [chatCompletionsPatchTool(cfg.workspace)]),
    webFetch(),
  ]
  return tools
}

export { chatCompletionsShellTool, chatCompletionsPatchTool } from './chat-completions-tools.js'

export { createDelegateTool } from './delegate-tool.js'
export type { DelegateHandler, DelegateInput } from './delegate-tool.js'

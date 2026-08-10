import { tool } from '@openai/agents'
import { z } from 'zod'

export interface DelegateInput {
  prompt: string
  description?: string
  subagentType?: string
}

export type DelegateHandler = (input: DelegateInput) => Promise<string>

const delegateParameters = z.object({
  prompt: z.string().min(1).describe('The task prompt handed to a sub-agent. Be specific: include file paths, questions, or patterns to investigate.'),
  description: z.string().optional().describe('Short human-readable label for the task, e.g. "Exploring project structure"'),
  subagentType: z.string().optional().describe('Sub-agent type. Available: "explore" (read-only code exploration)'),
})

export function createDelegateTool(handler: DelegateHandler) {
  return tool({
    name: 'delegate',
    description:
      'Spawn a sub-agent in its own isolated session. The sub-agent has its own context window — useful when reading many files would clutter your own context.\n\n' +
      'Available sub-agents:\n' +
      '- explore: Read-only. Can search code (rg), read files, run shell commands. Cannot write. Set subagentType: "explore".\n\n' +
      'Consider delegate when: exploring unfamiliar codebases, analyzing architecture, or gathering information across many files. It runs independently and returns a summary.',
    parameters: delegateParameters,
    execute: async (input) => handler(input),
  })
}
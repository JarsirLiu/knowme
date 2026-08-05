import { Agent, setTracingDisabled } from '@openai/agents'
import type { Tool } from '@openai/agents'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { loadConfig } from './config.js'
import { createReadOnlyTools, createReviewTools, createTools } from './tools/index.js'
import { getExplorerInstructions, getInstructions, getReviewerInstructions } from './instructions.js'

export interface CodingAgent {
  agent: Agent
  cfg: ReturnType<typeof loadConfig>
}

export function createCodingAgent(overrides: Partial<ReturnType<typeof loadConfig>> = {}): CodingAgent {
  const cfg = { ...loadConfig(), ...overrides }

  setTracingDisabled(true)

  const provider = createOpenAICompatible({
    name: cfg.model,
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
  })

  const model = aisdk(provider.chatModel(cfg.model))

  const explorerAgent = new Agent({
    name: 'Project Explorer',
    model,
    instructions: getExplorerInstructions(cfg.workspace),
    tools: createReadOnlyTools(cfg.workspace),
  })

  const reviewerAgent = new Agent({
    name: 'Code Reviewer',
    model,
    instructions: getReviewerInstructions(cfg.workspace),
    tools: createReviewTools(cfg.workspace),
  })

  const tools = createTools(cfg)
  const instructions = getInstructions(cfg.workspace)

  const agent = new Agent({
    name: 'SuperAgent',
    model,
    instructions,
    tools: [
      ...tools,
      explorerAgent.asTool({
        toolName: 'explore_project',
        toolDescription:
          'Inspect the current workspace in read-only mode and return a concise project map, relevant files, and implementation risks. Use before making unfamiliar changes.',
        runOptions: {
          maxTurns: null,
        },
      }),
      reviewerAgent.asTool({
        toolName: 'review_code_quality',
        toolDescription:
          'Perform an independent, read-only quality review of the current project or recent changes. Check correctness, architecture, compatibility debt, persistence, security, tests, operations, and user-facing contracts. Return prioritized findings with concrete evidence and fixes.',
        runOptions: {
          maxTurns: null,
        },
      }),
    ],
  })

  return { agent, cfg }
}

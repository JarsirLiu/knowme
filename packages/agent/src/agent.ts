import { Agent, setTracingDisabled } from '@openai/agents'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { loadConfig } from './config.js'
import { createReadOnlyTools, createReviewTools, createTools } from './tools/index.js'
import { getInstructions, getExplorerInstructions, getReviewerInstructions } from './instructions.js'


export interface CodingAgent {
  agent: Agent
  cfg: ReturnType<typeof loadConfig>
}

function createTimedFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('Model request timed out')), timeoutMs)
    const upstreamSignal = init?.signal
    const abort = () => controller.abort(upstreamSignal?.reason)

    if (upstreamSignal?.aborted) abort()
    else upstreamSignal?.addEventListener('abort', abort, { once: true })

    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener('abort', abort)
    }
  }
}

export function createCodingAgent(overrides: Partial<ReturnType<typeof loadConfig>> = {}): CodingAgent {
  const cfg = { ...loadConfig(), ...overrides }

  setTracingDisabled(true)

  const provider = createOpenAICompatible({
    name: 'superagent-compatible',
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    fetch: createTimedFetch(cfg.modelTimeoutMs),
  })

  const model = aisdk(provider.chatModel(cfg.model))

  const explorerAgent = new Agent({
    name: 'Project Explorer',
    model,
    instructions: getExplorerInstructions(),
    tools: createReadOnlyTools(cfg.workspace),
  })

  const reviewerAgent = new Agent({
    name: 'Code Reviewer',
    model,
    instructions: getReviewerInstructions(),
    tools: createReviewTools(cfg.workspace),
  })

  const tools = createTools(cfg)
  const instructions = getInstructions()

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

import { Agent, setTracingDisabled } from '@openai/agents'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { loadConfig } from './config.js'
import { createTools } from './tools/index.js'
import { createDelegateTool, type DelegateHandler } from './tools/delegate-tool.js'
import { getInstructions, type AgentType } from './instructions.js'
import { createSkillTools } from './skills/index.js'
import { exploreAgentPrompt } from './prompts/templates/explore-agent.js'
import { ChatCompletionsCompactionFetch } from './context-compaction/compaction-fetch.js'


export interface CodingAgent {
  agent: Agent
  cfg: ReturnType<typeof loadConfig>
}

export function getExploreAgentPrompt(): string {
  return exploreAgentPrompt()
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

export async function createCodingAgent(
  overrides: Partial<ReturnType<typeof loadConfig>> & {
    delegateHandler?: DelegateHandler
    agentType?: AgentType
  } = {},
): Promise<CodingAgent> {
  const cfg = { ...loadConfig(), ...overrides }
  const agentType = overrides.agentType ?? 'main'

  setTracingDisabled(true)

  const provider = createOpenAICompatible({
    name: 'cloudagent-compatible',
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    fetch: new ChatCompletionsCompactionFetch(
      createTimedFetch(cfg.modelTimeoutMs),
      cfg.contextCompaction,
    ).fetch,
  })

  const model = aisdk(provider.chatModel(cfg.model))

  const tools = createTools(cfg, agentType === 'explore' ? { excludeEdit: true } : undefined)
  const instructions = getInstructions(agentType)
  const skillManagerTools = createSkillTools(cfg.workspace)

  const delegateTool = overrides.delegateHandler
    ? createDelegateTool(overrides.delegateHandler)
    : undefined

  const agent = new Agent({
    name: agentType === 'explore' ? 'CloudAgent/Explore' : 'CloudAgent',
    model,
    instructions,
    tools: [
      ...tools,
      ...skillManagerTools,
      ...(delegateTool && agentType !== 'explore' ? [delegateTool] : []),
    ],
  })

  return { agent, cfg }
}

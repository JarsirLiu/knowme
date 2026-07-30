import { Agent, setTracingDisabled } from '@openai/agents'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { loadConfig } from './config.js'
import { createTools } from './tools/index.js'
import { getInstructions } from './instructions.js'

export interface CodingAgent {
  agent: Agent
  cfg: ReturnType<typeof loadConfig>
}

export function createCodingAgent(): CodingAgent {
  const cfg = loadConfig()

  setTracingDisabled(true)

  const provider = createOpenAICompatible({
    name: cfg.model,
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
  })

  const model = aisdk(provider.chatModel(cfg.model))

  const tools = createTools(cfg)
  const instructions = getInstructions(cfg.workspace)

  const agent = new Agent({
    name: 'SuperAgent',
    model,
    instructions,
    tools,
  })

  return { agent, cfg }
}

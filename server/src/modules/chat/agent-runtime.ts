import { createCodingAgent, type CodingAgent } from '@superagent/agent'

export type CodingAgentInstance = CodingAgent['agent']

export interface AgentRuntime {
  createAgent(workspace: string): Promise<CodingAgentInstance>
}

export class DefaultAgentRuntime implements AgentRuntime {
  async createAgent(workspace: string) {
    const { agent } = await createCodingAgent({ workspace })
    return agent
  }
}

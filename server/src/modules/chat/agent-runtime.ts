import { createCodingAgent, type CodingAgent, type AgentType } from '@superagent/agent'
import type { DelegateHandler } from '@superagent/agent'

export type CodingAgentInstance = CodingAgent['agent']

export interface AgentRuntime {
  createAgent(workspace: string, opts?: { delegateHandler?: DelegateHandler; agentType?: AgentType }): Promise<CodingAgentInstance>
}

export class DefaultAgentRuntime implements AgentRuntime {
  async createAgent(workspace: string, opts?: { delegateHandler?: DelegateHandler; agentType?: AgentType }) {
    const { agent } = await createCodingAgent({
      workspace,
      delegateHandler: opts?.delegateHandler,
      agentType: opts?.agentType,
    })
    return agent
  }
}

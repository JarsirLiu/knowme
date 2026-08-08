import type { Session } from '@openai/agents'
import { createCodingAgent, type CodingAgent } from '@superagent/agent'
import { PrismaAgentSession } from '../history/agent-session-store.js'
import {
  loadSessionCompactionOptions,
  type CompactionObserver,
  type SessionCompactionResult,
  type SessionCompactionTrigger,
} from '../history/session-compaction.js'

export type CodingAgentInstance = CodingAgent['agent']

export type CompactionSession = Session & {
  compact(trigger: SessionCompactionTrigger): Promise<SessionCompactionResult>
}

export interface AgentSessionFactory {
  createSession(sessionId: string, observer: CompactionObserver): CompactionSession
}

export interface AgentRuntime {
  createAgent(workspace: string): Promise<CodingAgentInstance>
  createSession(sessionId: string, observer: CompactionObserver): Session
}

export class DefaultAgentSessionFactory implements AgentSessionFactory {
  createSession(sessionId: string, observer: CompactionObserver) {
    return new PrismaAgentSession(sessionId, loadSessionCompactionOptions(), observer)
  }
}

export class DefaultAgentRuntime implements AgentRuntime {
  private readonly sessionFactory = new DefaultAgentSessionFactory()

  async createAgent(workspace: string) {
    const { agent } = await createCodingAgent({ workspace })
    return agent
  }

  createSession(sessionId: string, observer: CompactionObserver) {
    return this.sessionFactory.createSession(sessionId, observer)
  }
}

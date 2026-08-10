import type { DelegateInput } from '@superagent/agent'
import { ApprovalService } from '../approvals/approval.service.js'
import { ConversationService } from '../conversations/conversation.service.js'
import { TimelineEventStore } from '../events/timeline-event-store.js'
import { PrismaAgentRunRepository, type AgentRunRepository } from '../runs/agent-run-repository.js'

const POLL_MS = 500
const DEFAULT_DELEGATE_TIMEOUT_MS = 10 * 60_000

export class SubagentDelegateService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly timelineStore: TimelineEventStore,
    private readonly enqueueRun: (runId: string) => Promise<void>,
    private readonly runRepository: AgentRunRepository = new PrismaAgentRunRepository(),
    private readonly approvalService: ApprovalService = new ApprovalService(),
  ) {}

  async delegate(
    input: DelegateInput,
    parentContext: { conversationId: string; parentRunId: string; toolCallId?: string },
  ): Promise<string> {
    const parentConversation = await this.conversationService.get(parentContext.conversationId)
    const title = input.description?.trim()
      ?? input.subagentType?.trim()
      ?? input.prompt.slice(0, 60)
    const clientMessageId = `delegate:${parentContext.parentRunId}:${crypto.randomUUID()}`

    const child = await this.conversationService.createChildSession({
      projectId: parentConversation.projectId,
      parentConversationId: parentContext.conversationId,
      parentRunId: parentContext.parentRunId,
      title,
      message: input.prompt,
      clientMessageId,
    })

    await this.timelineStore.append(
      parentContext.conversationId,
      parentContext.parentRunId,
      'subagent.started',
      { childConversationId: child.conversation.id, title, toolCallId: parentContext.toolCallId ?? '' },
    )

    await this.enqueueRun(child.run.id)

    try {
      const result = await this.waitForTerminal(child.run.id)
      await this.timelineStore.append(
        parentContext.conversationId,
        parentContext.parentRunId,
        'subagent.completed',
        { childConversationId: child.conversation.id, result },
      )
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.timelineStore.append(
        parentContext.conversationId,
        parentContext.parentRunId,
        'subagent.completed',
        { childConversationId: child.conversation.id, result: message },
      )
      throw error
    }
  }

  private async waitForTerminal(runId: string): Promise<string> {
    const deadline = Date.now() + DEFAULT_DELEGATE_TIMEOUT_MS
    while (Date.now() < deadline) {
      const run = await this.runRepository.get(runId)
      if (!run) throw new Error(`Child run not found: ${runId}`)
      if (run.status === 'completed') return run.output ?? ''
      if (run.status === 'waiting_approval') {
        if ((await this.approvalService.getPendingForRun(runId)).length === 0) {
          // Pending option: wait for the approval to be resolved by the parent.
        }
      }
      if (['failed', 'cancelled', 'interrupted'].includes(run.status)) {
        return `Child run ended with status ${run.status}${run.error ? `: ${run.error}` : ''}`
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    throw new Error('Child run timed out')
  }
}
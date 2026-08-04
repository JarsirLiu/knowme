import type { FastifyInstance } from 'fastify'
import { ApprovalService } from './approvals/approval.service.js'
import { registerApprovalRoutes } from './approvals/approval.routes.js'
import { TurnService } from './chat/turn.service.js'
import { ConversationService } from './conversations/conversation.service.js'
import { registerConversationRoutes } from './conversations/conversation.routes.js'
import { DeviceService } from './devices/device.service.js'
import { registerDeviceRoutes } from './devices/device.routes.js'
import { TimelineEventStore } from './events/timeline-event-store.js'
import { ProjectService } from './projects/project.service.js'
import { PrismaProjectRepository } from './projects/project-repository.js'
import { ProjectPathValidator } from './projects/project-path-validator.js'
import { DirectoryService } from './projects/directory.service.js'
import { registerProjectRoutes } from './projects/project.routes.js'
import { RunCoordinator } from './runs/run-coordinator.js'
import { PrismaAgentRunRepository } from './runs/agent-run-repository.js'
import { AgentRunExecutor } from './chat/agent-run-executor.js'
import { DefaultAgentRuntime } from './chat/agent-runtime.js'
import { TimelineEventHub } from './events/timeline-event-hub.js'
import { PrismaConversationRepository } from './conversations/conversation-repository.js'
import { LegacyTimelineMigration } from './conversations/legacy-timeline-migration.js'
import { PrismaApprovalRepository } from './approvals/approval-repository.js'

export function registerRoutes(app: FastifyInstance) {
  const projectService = new ProjectService(new PrismaProjectRepository(), new ProjectPathValidator())
  const directoryService = new DirectoryService()
  const timelineHub = new TimelineEventHub()
  const timelineStore = new TimelineEventStore(timelineHub)
  const conversationService = new ConversationService(
    timelineStore,
    new PrismaConversationRepository(),
    new LegacyTimelineMigration(),
  )
  const approvalService = new ApprovalService(new PrismaApprovalRepository())
  const deviceService = new DeviceService()
  const agentRunRepository = new PrismaAgentRunRepository()
  const agentExecutor = new AgentRunExecutor(
    conversationService,
    approvalService,
    timelineStore,
    agentRunRepository,
    projectService,
    new DefaultAgentRuntime(),
  )
  const coordinator = new RunCoordinator(conversationService, approvalService, timelineStore, agentExecutor)
  const turnService = new TurnService(conversationService, coordinator, timelineStore, timelineHub)

  app.addHook('onReady', async () => coordinator.start())
  app.addHook('onClose', async () => coordinator.stop())

  registerProjectRoutes(app, projectService, directoryService, conversationService, turnService)
  registerConversationRoutes(app, conversationService, turnService)
  registerApprovalRoutes(app, approvalService, coordinator)
  registerDeviceRoutes(app, deviceService)
}

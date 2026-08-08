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
import { SkillService } from './projects/skill.service.js'
import { PrismaProjectRepository } from './projects/project-repository.js'
import { ProjectPathValidator } from './projects/project-path-validator.js'
import { registerProjectRoutes } from './projects/project.routes.js'
import { DirectoryService } from './directory/directory.service.js'
import { registerDirectoryRoutes } from './directory/directory.routes.js'
import { WindowsPlatform } from './directory/platforms/windows.js'
import { UnixPlatform } from './directory/platforms/unix.js'
import { RunCoordinator } from './runs/run-coordinator.js'
import { PrismaAgentRunRepository } from './runs/agent-run-repository.js'
import { AgentRunExecutor } from './chat/agent-run-executor.js'
import { DefaultAgentRuntime } from './chat/agent-runtime.js'
import { DefaultAgentSessionFactory } from './history/agent-session-store.js'
import { TimelineEventHub } from './events/timeline-event-hub.js'
import { PrismaConversationRepository } from './conversations/conversation-repository.js'
import { LegacyTimelineMigration } from './conversations/legacy-timeline-migration.js'
import { PrismaApprovalRepository } from './approvals/approval-repository.js'
import { PrismaAgentSessionLifecycleRepository } from './history/session-lifecycle-repository.js'
import { RunScheduler } from './runs/run-scheduler.js'
import { PrismaRunLifecycleRepository } from './runs/run-lifecycle-repository.js'

export function registerRoutes(app: FastifyInstance) {
  const projectService = new ProjectService(new PrismaProjectRepository(), new ProjectPathValidator())
  const platform = process.platform === 'win32' ? new WindowsPlatform() : new UnixPlatform()
  const directoryService = new DirectoryService(platform)
  const timelineHub = new TimelineEventHub()
  const timelineStore = new TimelineEventStore(timelineHub)
  const sessionLifecycleRepository = new PrismaAgentSessionLifecycleRepository()
  const conversationService = new ConversationService(
    timelineStore,
    new PrismaConversationRepository(sessionLifecycleRepository),
    new LegacyTimelineMigration(),
  )
  const approvalService = new ApprovalService(new PrismaApprovalRepository())
  const deviceService = new DeviceService()
  const agentRunRepository = new PrismaAgentRunRepository(sessionLifecycleRepository)
  const agentSessionFactory = new DefaultAgentSessionFactory()
  const agentExecutor = new AgentRunExecutor(
    conversationService,
    approvalService,
    timelineStore,
    agentRunRepository,
    projectService,
    new DefaultAgentRuntime(),
    agentSessionFactory,
  )
  const coordinator = new RunCoordinator(
    conversationService,
    approvalService,
    timelineStore,
    agentExecutor,
    new RunScheduler(sessionLifecycleRepository),
    new PrismaRunLifecycleRepository(sessionLifecycleRepository),
  )
  const turnService = new TurnService(conversationService, coordinator, timelineStore, timelineHub)

  app.addHook('onReady', async () => coordinator.start())
  app.addHook('onClose', async () => coordinator.stop())

  registerDirectoryRoutes(app, directoryService)
  registerProjectRoutes(app, projectService, conversationService, turnService, new SkillService(projectService))
  registerConversationRoutes(app, conversationService, turnService)
  registerApprovalRoutes(app, approvalService, coordinator)
  registerDeviceRoutes(app, deviceService)
}

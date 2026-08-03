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
import { DirectoryService } from './projects/directory.service.js'
import { registerProjectRoutes } from './projects/project.routes.js'
import { RunCoordinator } from './runs/run-coordinator.js'

export function registerRoutes(app: FastifyInstance) {
  const projectService = new ProjectService()
  const directoryService = new DirectoryService()
  const timelineStore = new TimelineEventStore()
  const conversationService = new ConversationService(timelineStore)
  const approvalService = new ApprovalService()
  const coordinator = new RunCoordinator(conversationService, approvalService, timelineStore)
  const deviceService = new DeviceService()
  const turnService = new TurnService(conversationService, coordinator, timelineStore)

  app.addHook('onReady', async () => coordinator.start())
  app.addHook('onClose', async () => coordinator.stop())

  registerProjectRoutes(app, projectService, directoryService, conversationService, turnService)
  registerConversationRoutes(app, conversationService, turnService)
  registerApprovalRoutes(app, approvalService, coordinator)
  registerDeviceRoutes(app, deviceService)
}

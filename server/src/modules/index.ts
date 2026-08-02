import type { FastifyInstance } from 'fastify'
import { ApprovalService } from './approvals/approval.service.js'
import { registerApprovalRoutes } from './approvals/approval.routes.js'
import { TurnService } from './chat/turn.service.js'
import { ConversationService } from './conversations/conversation.service.js'
import { registerConversationRoutes } from './conversations/conversation.routes.js'
import { DeviceService } from './devices/device.service.js'
import { registerDeviceRoutes } from './devices/device.routes.js'
import { RunEventStore } from './events/run-event-store.js'
import { ProjectService } from './projects/project.service.js'
import { registerProjectRoutes } from './projects/project.routes.js'

export function registerRoutes(app: FastifyInstance) {
  const projectService = new ProjectService()
  const conversationService = new ConversationService()
  const approvalService = new ApprovalService()
  const deviceService = new DeviceService()
  const eventStore = new RunEventStore()
  const turnService = new TurnService(conversationService, approvalService, eventStore)

  registerProjectRoutes(app, projectService, conversationService, turnService)
  registerConversationRoutes(app, conversationService, turnService)
  registerApprovalRoutes(app, approvalService)
  registerDeviceRoutes(app, deviceService)
}

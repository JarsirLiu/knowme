import type { FastifyInstance } from 'fastify'
import { ToolApprovalService } from '../services/tool-approval.js'
import { DeviceManager } from '../services/device-manager.js'
import { ChatService } from '../services/chat-service.js'
import { ConversationService } from '../services/conversation-service.js'
import { ProjectService } from '../services/project-service.js'
import { registerProjectRoutes } from './projects.js'
import { registerConversationRoutes } from './conversations.js'
import { registerToolRoutes } from './tools.js'
import { registerDeviceRoutes } from './devices.js'

export function registerRoutes(app: FastifyInstance) {
  const projectService = new ProjectService()
  const conversationService = new ConversationService()
  const approvalService = new ToolApprovalService()
  const deviceManager = new DeviceManager()
  const chatService = new ChatService(conversationService, approvalService)

  registerProjectRoutes(app, projectService, conversationService, chatService)
  registerConversationRoutes(app, conversationService, chatService)
  registerToolRoutes(app, approvalService)
  registerDeviceRoutes(app, deviceManager)
}

import type { FastifyInstance } from 'fastify'
import { SessionManager } from '../services/session-manager.js'
import { ToolApprovalService } from '../services/tool-approval.js'
import { DeviceManager } from '../services/device-manager.js'
import { ChatService } from '../services/chat-service.js'
import { registerSessionRoutes } from './sessions.js'
import { registerChatRoutes } from './chat.js'
import { registerToolRoutes } from './tools.js'
import { registerDeviceRoutes } from './devices.js'

export function registerRoutes(app: FastifyInstance) {
  const sessionManager = new SessionManager()
  const approvalService = new ToolApprovalService()
  const deviceManager = new DeviceManager()
  const chatService = new ChatService(approvalService)

  registerSessionRoutes(app, sessionManager)
  registerChatRoutes(app, chatService)
  registerToolRoutes(app, approvalService)
  registerDeviceRoutes(app, deviceManager)
}
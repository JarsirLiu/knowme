import type { Session } from './types/session.js'
import type { Message } from './types/message.js'
import type { Device } from './types/device.js'

export interface SessionResponse {
  session: Session
}

export interface SessionListResponse {
  sessions: Session[]
}

export interface MessageListResponse {
  messages: Message[]
}

export interface DeviceResponse {
  device: Device
}

export interface DeviceListResponse {
  devices: Device[]
}
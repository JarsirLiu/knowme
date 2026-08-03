import type { Project, Conversation, ConversationTimeline, DirectoryListing } from './types/index.js'
import type { Device } from './types/device.js'

export interface ProjectResponse {
  project: Project
}

export interface ProjectListResponse {
  projects: Project[]
}

export interface ConversationListResponse {
  conversations: Conversation[]
}

export interface ConversationResponse {
  conversation: Conversation
}

export interface ConversationTimelineResponse extends ConversationTimeline {
}

export interface DeviceResponse {
  device: Device
}

export interface DeviceListResponse {
  devices: Device[]
}

export interface DirectoryListingResponse extends DirectoryListing {}

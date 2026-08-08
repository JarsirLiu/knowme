export interface Project {
  id: string
  name: string
  rootPath: string
  settingsJson?: string | null
  createdAt: string
  updatedAt: string
}

export interface SkillInfo {
  name: string
  description: string
  version: string
  hasReferences: boolean
  hasScripts: boolean
}

export interface SkillsListResponse {
  skills: SkillInfo[]
}

export type ConversationRuntimeStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'failed'
  | 'interrupted'
  | 'cancelled'

export interface Conversation {
  id: string
  projectId: string
  title: string
  status: 'active' | 'archived'
  agentProfile: string
  runtimeStatus?: ConversationRuntimeStatus
  createdAt: string
  updatedAt: string
}

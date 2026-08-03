export interface Project {
  id: string
  name: string
  rootPath: string
  settingsJson?: string | null
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  projectId: string
  title: string
  status: 'active' | 'archived'
  agentProfile: string
  createdAt: string
  updatedAt: string
}

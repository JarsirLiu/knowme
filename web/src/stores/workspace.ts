import { create } from 'zustand'
import type { Conversation, ConversationRuntimeStatus, Project } from '@superagent/core'
import { client } from '@/api/client'

export type ConversationDisplayStatus = ConversationRuntimeStatus | 'error'

export type ActiveConversation =
  | { kind: 'draft'; draftId: string; projectId: string }
  | { kind: 'persisted'; conversationId: string; projectId: string }

function createDraft(projectId: string): ActiveConversation {
  return { kind: 'draft', draftId: crypto.randomUUID(), projectId }
}

interface WorkspaceState {
  initialized: boolean
  projects: Project[]
  conversationsByProject: Record<string, Conversation[]>
  activeProjectId: string
  active: ActiveConversation | null
  deletingConversationId: string | null
  mobileNavOpen: boolean
  projectModalOpen: boolean
  conversationStatuses: Record<string, ConversationDisplayStatus>
}

interface WorkspaceActions {
  loadWorkspace: () => Promise<void>
  createProject: (name: string, rootPath: string) => Promise<boolean>
  deleteConversation: (conversationId: string, projectId: string) => Promise<void>
  selectProject: (projectId: string) => void
  selectConversation: (conversationId: string, projectId: string) => void
  newConversation: (projectId: string) => void
  handleConversationCreated: (data: { conversationId: string; title: string; draftId: string; projectId: string }) => void
  setDeletingConversationId: (id: string | null) => void
  setMobileNavOpen: (open: boolean) => void
  setConversationStatuses: (statuses: Record<string, ConversationDisplayStatus>) => void
  setProjectModalOpen: (open: boolean) => void
}

type WorkspaceStore = WorkspaceState & WorkspaceActions

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  initialized: false,
  projects: [],
  conversationsByProject: {},
  activeProjectId: '',
  active: null,
  deletingConversationId: null,
  mobileNavOpen: false,
  projectModalOpen: false,
  conversationStatuses: {},

  loadWorkspace: async () => {
    try {
      const nextProjects = await client.listProjects()
      const pairs = await Promise.all(
        nextProjects.map(async (project) => [project.id, await client.listConversations(project.id)] as const),
      )
      const nextConversations = Object.fromEntries(pairs)
      const firstProject = nextProjects[0]
      const firstConversation = firstProject ? nextConversations[firstProject.id]?.[0] : undefined

      set({
        projects: nextProjects,
        conversationsByProject: nextConversations,
        activeProjectId: firstProject?.id ?? '',
        active: firstConversation
          ? { kind: 'persisted', conversationId: firstConversation.id, projectId: firstProject!.id }
          : firstProject
            ? createDraft(firstProject.id)
            : null,
        initialized: true,
      })
    } catch {
      set({ initialized: true })
    }
  },

  createProject: async (name, rootPath) => {
    try {
      const project = await client.createProject({ name, rootPath })
      set((state) => ({
        projects: [project, ...state.projects],
        conversationsByProject: { ...state.conversationsByProject, [project.id]: [] },
        activeProjectId: project.id,
        active: createDraft(project.id),
      }))
      return true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return false
    }
  },

  deleteConversation: async (conversationId, projectId) => {
    const state = get()
    if (state.deletingConversationId) return
    const conversations = state.conversationsByProject[projectId] ?? []
    const target = conversations.find((conversation) => conversation.id === conversationId)
    if (!target) return
    if (!window.confirm(`删除会话“${target.title}”？`)) return

    set({ deletingConversationId: conversationId })
    try {
      await client.deleteConversation(conversationId)
      const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId)
      const activeConversationId = state.active?.kind === 'persisted' ? state.active.conversationId : undefined
      const deletingActive = activeConversationId === conversationId

      set((current) => ({
        conversationsByProject: {
          ...current.conversationsByProject,
          [projectId]: nextConversations,
        },
        ...(deletingActive
          ? {
              active: nextConversations[0]
                ? { kind: 'persisted', conversationId: nextConversations[0].id, projectId }
                : createDraft(projectId),
            }
          : {}),
      }))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      set({ deletingConversationId: null })
    }
  },

  selectProject: (projectId) => {
    const state = get()
    const firstConversation = state.conversationsByProject[projectId]?.[0]
    set({
      activeProjectId: projectId,
      active: firstConversation
        ? { kind: 'persisted', conversationId: firstConversation.id, projectId }
        : createDraft(projectId),
      mobileNavOpen: false,
    })
  },

  selectConversation: (conversationId, projectId) => {
    set({
      activeProjectId: projectId,
      active: { kind: 'persisted', conversationId, projectId },
      mobileNavOpen: false,
    })
  },

  newConversation: (projectId) => {
    if (!projectId) return
    set({
      activeProjectId: projectId,
      active: createDraft(projectId),
      mobileNavOpen: false,
    })
  },

  handleConversationCreated: (data) => {
    set((state) => {
      const existing = state.conversationsByProject[data.projectId] ?? []
      if (existing.some((conversation) => conversation.id === data.conversationId)) return state
      const now = new Date().toISOString()
      const conversation: Conversation = {
        id: data.conversationId,
        projectId: data.projectId,
        title: data.title,
        status: 'active',
        agentProfile: 'coding',
        runtimeStatus: 'queued',
        createdAt: now,
        updatedAt: now,
      }
      return {
        conversationsByProject: { ...state.conversationsByProject, [data.projectId]: [conversation, ...existing] },
        ...(state.active?.kind === 'draft' && state.active.draftId === data.draftId
          ? { active: { kind: 'persisted', conversationId: data.conversationId, projectId: data.projectId } }
          : {}),
      }
    })
  },

  setDeletingConversationId: (id) => set({ deletingConversationId: id }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setConversationStatuses: (statuses) => set({ conversationStatuses: statuses }),
  setProjectModalOpen: (open) => set({ projectModalOpen: open }),
}))
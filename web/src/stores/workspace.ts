import { create } from 'zustand'
import type { Conversation, Project } from '@cloudagent/core'
import { client } from '@/api/client'

export type ActiveConversation =
  | { kind: 'draft'; draftId: string; projectId: string }
  | { kind: 'persisted'; conversationId: string; projectId: string }

function createDraft(projectId: string): ActiveConversation {
  return { kind: 'draft', draftId: crypto.randomUUID(), projectId }
}

const isRootConversation = (c: Conversation): boolean => !c.parentConversationId

const firstRootConversation = (conversations: Conversation[] | undefined): Conversation | undefined =>
  conversations?.find(isRootConversation)

interface WorkspaceState {
  initialized: boolean
  projects: Project[]
  conversationsByProject: Record<string, Conversation[]>
  activeProjectId: string
  active: ActiveConversation | null
}

interface WorkspaceActions {
  loadWorkspace: () => Promise<void>
  createProject: (name: string, rootPath: string) => Promise<boolean>
  deleteConversation: (conversationId: string, projectId: string) => Promise<void>
  selectProject: (projectId: string) => void
  selectConversation: (conversationId: string, projectId: string) => void
  newConversation: (projectId: string) => void
  handleConversationCreated: (data: { conversationId: string; title: string; draftId: string; projectId: string }) => void
  fetchConversation: (conversationId: string) => Promise<string | null>
  addConversation: (conversation: Conversation) => void
}

type WorkspaceStore = WorkspaceState & WorkspaceActions

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  initialized: false,
  projects: [],
  conversationsByProject: {},
  activeProjectId: '',
  active: null,

  loadWorkspace: async () => {
    try {
      const nextProjects = await client.listProjects()
      const pairs = await Promise.all(
        nextProjects.map(async (project) => [project.id, await client.listConversations(project.id)] as const),
      )
      const nextConversations = Object.fromEntries(pairs)
      const firstProject = nextProjects[0]
      const firstConversation = firstProject
        ? firstRootConversation(nextConversations[firstProject.id])
        : undefined

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
    await client.deleteConversation(conversationId)
    const state = get()
    const nextConversations = (state.conversationsByProject[projectId] ?? []).filter(
      (conversation) => conversation.id !== conversationId,
    )
    const activeConversationId = state.active?.kind === 'persisted' ? state.active.conversationId : undefined
    const deletingActive = activeConversationId === conversationId

    set((current) => ({
      conversationsByProject: {
        ...current.conversationsByProject,
        [projectId]: nextConversations,
      },
      ...(deletingActive
        ? {
            active: (() => {
              const fallback = firstRootConversation(nextConversations)
              return fallback
                ? { kind: 'persisted', conversationId: fallback.id, projectId }
                : createDraft(projectId)
            })(),
          }
        : {}),
    }))
  },

  selectProject: (projectId) => {
    const state = get()
    const firstConversation = firstRootConversation(state.conversationsByProject[projectId])
    set({
      activeProjectId: projectId,
      active: firstConversation
        ? { kind: 'persisted', conversationId: firstConversation.id, projectId }
        : createDraft(projectId),
    })
  },

  selectConversation: (conversationId, projectId) => {
    set({
      activeProjectId: projectId,
      active: { kind: 'persisted', conversationId, projectId },
    })
  },

  newConversation: (projectId) => {
    if (!projectId) return
    set({
      activeProjectId: projectId,
      active: createDraft(projectId),
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

  fetchConversation: async (conversationId) => {
    try {
      const timeline = await client.getTimeline(conversationId)
      const conversation = timeline.conversation
      const state = get()
      const existing = state.conversationsByProject[conversation.projectId] ?? []
      if (existing.some((c) => c.id === conversationId)) return conversation.projectId
      set((current) => ({
        conversationsByProject: {
          ...current.conversationsByProject,
          [conversation.projectId]: [conversation as Conversation, ...existing],
        },
      }))
      return conversation.projectId
    } catch {
      return null
    }
  },

  addConversation: (conversation) => {
    set((state) => {
      const existing = state.conversationsByProject[conversation.projectId] ?? []
      if (existing.some((c) => c.id === conversation.id)) return state
      return {
        conversationsByProject: {
          ...state.conversationsByProject,
          [conversation.projectId]: [conversation, ...existing],
        },
      }
    })
  },
}))
import { create } from 'zustand'
import type { ConversationRuntimeStatus } from '@superagent/core'

export type ConversationDisplayStatus = ConversationRuntimeStatus | 'error'

interface UIState {
  mobileNavOpen: boolean
  projectModalOpen: boolean
  deletingConversationId: string | null
  conversationRuntimeStatuses: Record<string, ConversationDisplayStatus>
}

interface UIActions {
  setMobileNavOpen: (open: boolean) => void
  setProjectModalOpen: (open: boolean) => void
  setDeletingConversationId: (id: string | null) => void
  setConversationRuntimeStatuses: (statuses: Record<string, ConversationDisplayStatus>) => void
}

type UIStore = UIState & UIActions

export const useUIStore = create<UIStore>((set) => ({
  mobileNavOpen: false,
  projectModalOpen: false,
  deletingConversationId: null,
  conversationRuntimeStatuses: {},

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setProjectModalOpen: (open) => set({ projectModalOpen: open }),
  setDeletingConversationId: (id) => set({ deletingConversationId: id }),
  setConversationRuntimeStatuses: (statuses) => set({ conversationRuntimeStatuses: statuses }),
}))
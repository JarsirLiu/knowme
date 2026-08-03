export interface StartTurnResult {
  conversation: import('./project.js').Conversation
  conversationId: string
  title: string
  runId: string
  created: boolean
}

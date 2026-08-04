export class ConversationHasActiveRunError extends Error {
  readonly code = 'conversation_has_active_run'

  constructor(readonly conversationId: string) {
    super(`Conversation has an active run: ${conversationId}`)
    this.name = 'ConversationHasActiveRunError'
  }
}

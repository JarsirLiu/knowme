export interface StartTurnResult {
  conversation: import('./project.js').Conversation
  runId: string
}

export interface RunEventEnvelope {
  runId: string
  sequence: number
  type: string
  payload: unknown
  createdAt: string
}

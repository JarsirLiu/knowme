export interface CreateProjectRequest {
  name: string
  rootPath: string
}

export interface StartTurnRequest {
  message: string
  clientMessageId: string
}

export interface ChatRequest {
  message: string
}

export interface ApproveToolRequest {
  toolCallId: string
}

export interface DenyToolRequest {
  toolCallId: string
}

export interface RegisterDeviceRequest {
  name: string
  endpoint: string
  apiKey: string
}

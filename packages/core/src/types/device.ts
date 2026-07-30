export type DeviceStatus = 'online' | 'offline'

export interface Device {
  id: string
  name: string
  endpoint: string
  apiKey: string
  status: DeviceStatus
  createdAt: string
  updatedAt: string
}
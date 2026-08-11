import { CloudagentClient } from '@cloudagent/client'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const client = new CloudagentClient({ baseUrl: API_BASE })

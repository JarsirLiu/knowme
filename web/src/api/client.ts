import { SuperagentClient } from '@superagent/client'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const client = new SuperagentClient({ baseUrl: API_BASE })

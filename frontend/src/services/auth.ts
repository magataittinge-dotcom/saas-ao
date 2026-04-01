import { api } from './api'
import type { User, Organization } from '@/types'

export const authService = {
  me: async (): Promise<{ user: User; organization: Organization }> => {
    const { data } = await api.get('/auth/me')
    return data
  },

  sync: async (payload: {
    organization_name?: string
    siret?: string
    plan?: string
  }): Promise<{ user: User; organization: Organization }> => {
    const { data } = await api.post('/auth/sync', payload)
    return data
  },
}

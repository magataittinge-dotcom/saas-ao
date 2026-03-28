import { api } from './api'
import type { User, Organization, AuthTokens } from '@/types'

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  name: string
  organization_name: string
  siret: string
  plan: 'pro' | 'business'
}

export interface AuthResponse {
  user: User
  organization: Organization
  tokens: AuthTokens
}

export const authService = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', payload)
    return data
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    return data
  },

  me: async (): Promise<{ user: User; organization: Organization }> => {
    const { data } = await api.get('/auth/me')
    return data
  },

  refreshToken: async (): Promise<AuthTokens> => {
    const { data } = await api.post<AuthTokens>('/auth/refresh')
    return data
  },
}

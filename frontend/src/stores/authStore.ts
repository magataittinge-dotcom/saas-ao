import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Organization } from '@/types'

interface AuthState {
  user: User | null
  organization: Organization | null
  accessToken: string | null
  isAuthenticated: boolean

  setAuth: (user: User, organization: Organization, token: string) => void
  setOrganization: (organization: Organization) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, organization, token) =>
        set({ user, organization, accessToken: token, isAuthenticated: true }),

      setOrganization: (organization) => set({ organization }),

      logout: () =>
        set({ user: null, organization: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Organization } from '@/types'

interface AuthState {
  user: User | null
  organization: Organization | null

  setAuth: (user: User, organization: Organization) => void
  setOrganization: (organization: Organization) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,

      setAuth: (user, organization) =>
        set({ user, organization }),

      setOrganization: (organization) => set({ organization }),

      logout: () =>
        set({ user: null, organization: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
      }),
    },
  ),
)

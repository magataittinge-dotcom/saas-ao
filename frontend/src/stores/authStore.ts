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

const CLE = 'auth-storage'

/**
 * P2-2 (REVUE-FRONT) : ce que le navigateur garde entre deux visites. Rien de personnel (ni e-mail, ni nom, ni
 * téléphone, ni SIRET, ni adresse) : des identifiants techniques, le rôle et l'offre. Le reste vit en mémoire, relu par
 * /auth/me à chaque ouverture (hooks/useAuth.ts).
 */
type EtatGarde = {
  user: Pick<User, 'id' | 'role' | 'organization_id'> | null
  organization: Pick<Organization, 'id' | 'plan' | 'trial_granted'> | null
}

function etatGarde(state: { user?: Partial<User> | null; organization?: Partial<Organization> | null } | null | undefined): EtatGarde {
  const u = state?.user
  const o = state?.organization
  return {
    user: u ? { id: u.id as string, role: u.role as User['role'], organization_id: u.organization_id as string } : null,
    organization: o ? { id: o.id as string, plan: o.plan as Organization['plan'], trial_granted: o.trial_granted } : null,
  }
}

/** Un stockage écrit avant P2-2 (version 0, toute la ligne) est réduit à sa relecture. */
export function migrerEtatGarde(persiste: unknown, _version: number): EtatGarde {
  return etatGarde(persiste as Parameters<typeof etatGarde>[0])
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,

      setAuth: (user, organization) =>
        set({ user, organization }),

      setOrganization: (organization) => set({ organization }),

      logout: () => {
        set({ user: null, organization: null })
        useAuthStore.persist.clearStorage() // fin de session : la clé disparaît du navigateur
      },
    }),
    {
      name: CLE,
      version: 1,
      migrate: (persiste, version) => migrerEtatGarde(persiste, version) as unknown as AuthState,
      partialize: (state) => etatGarde(state),
    },
  ),
)

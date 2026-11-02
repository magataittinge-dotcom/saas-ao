import { useEffect } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { setClerkTokenProvider } from '@/services/api'
import { poserVisiteAvantSortie } from '@/lib/visiteVeille'

export function useSyncUser(): boolean {
  const { isSignedIn, isLoaded, getToken, userId } = useAuth()
  const { setAuth, user, logout } = useAuthStore()

  // Register token provider synchronously
  setClerkTokenProvider(() => getToken())

  useEffect(() => {
    if (!isLoaded) return

    // User signed out or switched accounts → clear stale persisted state
    if (!isSignedIn) return
    if (user && userId && user.clerk_id !== userId) {
      logout() // clear stale org/plan from different account
    }

    authService.me()
      .then(({ user: u, organization: org }) => {
        setAuth(u, org)
      })
      .catch((err) => {
        console.error('[useSyncUser] FAILED:', err?.response?.status, err?.message)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId])

  return isLoaded
}

export function useLogout() {
  const { signOut } = useClerk()
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  return async () => {
    // R1 — la visite de la veille part tant que la session est ouverte (jamais sans jeton, 2 s au plus).
    await poserVisiteAvantSortie()
    logout()
    // Clerk recharge la page vers son adresse de sortie (par défaut « / ») : on lui donne /login (C12).
    await signOut({ redirectUrl: '/login' })
    navigate('/login')
  }
}

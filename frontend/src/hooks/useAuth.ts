import { useEffect } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { setClerkTokenProvider } from '@/services/api'

export function useSyncUser(): boolean {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { setAuth, user } = useAuthStore()

  // Register token provider synchronously
  setClerkTokenProvider(() => getToken())

  useEffect(() => {
    console.log('[useSyncUser] isLoaded:', isLoaded, 'isSignedIn:', isSignedIn, 'user:', !!user)
  }, [isLoaded, isSignedIn, user])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    authService.me()
      .then(({ user: u, organization: org }) => {
        setAuth(u, org)
      })
      .catch((err) => {
        console.error('[useSyncUser] FAILED:', err?.response?.status, err?.message)
      })
  }, [isLoaded, isSignedIn, setAuth])

  return isLoaded
}

export function useLogout() {
  const { signOut } = useClerk()
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  return async () => {
    logout()
    await signOut()
    navigate('/login')
  }
}

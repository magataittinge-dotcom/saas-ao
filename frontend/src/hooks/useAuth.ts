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
    if (user) return

    console.log('[useSyncUser] Fetching /api/auth/me...')
    authService.me()
      .then(({ user, organization }) => {
        console.log('[useSyncUser] OK:', user.email, organization.plan)
        setAuth(user, organization)
      })
      .catch((err) => {
        console.error('[useSyncUser] FAILED:', {
          status: err?.response?.status,
          data: err?.response?.data,
          message: err?.message,
        })
      })
  }, [isLoaded, isSignedIn, user, setAuth])

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

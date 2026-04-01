import { useEffect } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { setClerkTokenProvider } from '@/services/api'

/**
 * Syncs the Clerk session with our backend.
 * Call once near the root (inside BrowserRouter).
 */
export function useSyncUser() {
  const { isSignedIn, getToken } = useAuth()
  const { setAuth } = useAuthStore()

  // Register the token provider for axios interceptor
  useEffect(() => {
    setClerkTokenProvider(() => getToken())
  }, [getToken])

  // When signed in, fetch backend user + org
  useEffect(() => {
    if (!isSignedIn) return

    authService.me().then(({ user, organization }) => {
      setAuth(user, organization)
    }).catch(() => {
      // First login — backend will auto-create the user via get_auth_user
      // If /me fails, it means the sync happened but we need to retry
    })
  }, [isSignedIn, setAuth])
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

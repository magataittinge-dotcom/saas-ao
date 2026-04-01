import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token provider — set by ClerkTokenSync component at the root
let _getToken: (() => Promise<string | null>) | null = null

export function setClerkTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn
}

// Attach Clerk JWT to every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.replace('/login')
    }
    return Promise.reject(error)
  },
)

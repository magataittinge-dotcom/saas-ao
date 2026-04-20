import axios from 'axios'

// In dev, Vite proxies /api → http://localhost:8000 (see vite.config.ts)
// In prod, VITE_API_URL points to the real backend
const isProd = import.meta.env.PROD
const API_URL = isProd ? (import.meta.env.VITE_API_URL || '') : ''

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token provider — set synchronously by useSyncUser before any route renders
let _getToken: (() => Promise<string | null>) | null = null

export function setClerkTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn
}

// Attach Clerk JWT to every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    try {
      const token = await Promise.race([
        _getToken(),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ])
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      } else {
        console.warn('[api]', config.method?.toUpperCase(), config.url, '| NO TOKEN (timeout)')
      }
    } catch (err) {
      console.error('[api] getToken error:', err)
    }
  }
  return config
})

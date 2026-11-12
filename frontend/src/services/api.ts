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

// C22 — URLs signées : les accès fichiers directs (href, window.open,
// visionneuse) ne peuvent pas porter le header Bearer. On mint une URL
// signée à durée limitée (15 min) via l'API authentifiée, puis on l'utilise
// telle quelle dans le navigateur.
export async function getSignedFileUrl(fileUrl: string): Promise<string> {
  const { data } = await api.get<{ url: string }>('/files/sign', {
    params: { path: fileUrl },
  })
  // En dev l'URL relative passe par le proxy Vite (/api) ; en prod on préfixe.
  return `${API_URL}${data.url}`
}

// Attach Clerk JWT to every request.
// Réseau lent (bug vu par REVUE-FRONT) : la requête attend le jeton jusqu'à DELAI_JETON_MS. S'il n'arrive pas, ou si
// Clerk échoue, elle échoue proprement (ERR_JETON_INDISPONIBLE, sans réponse) : jamais envoyée sans jeton, donc jamais
// de 401 ni de déconnexion pour un jeton en retard. Sans session (Clerk rend null), elle part sans jeton, comme avant.
export const DELAI_JETON_MS = 15_000
const EN_RETARD = Symbol('jeton en retard')

api.interceptors.request.use(async (config) => {
  if (!_getToken) return config
  let token: string | null | typeof EN_RETARD
  let minuterie: ReturnType<typeof setTimeout> | undefined
  try {
    token = await Promise.race([
      _getToken(),
      new Promise<typeof EN_RETARD>((r) => { minuterie = setTimeout(() => r(EN_RETARD), DELAI_JETON_MS) }),
    ])
  } catch {
    token = EN_RETARD
  } finally {
    clearTimeout(minuterie)
  }
  if (token === EN_RETARD) {
    console.warn('[api]', config.method?.toUpperCase(), config.url, '| jeton indisponible, requête non envoyée')
    throw new axios.AxiosError('Jeton de session indisponible', 'ERR_JETON_INDISPONIBLE', config)
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// F-01 — session expirée : quand le serveur répond 401, UNE réaction pour toute l'appli (posée par useSyncUser :
// on garde la page d'où l'on vient, on ferme la session, l'écran de connexion dit pourquoi). L'appel reste en échec :
// aucun écran ne prend un 401 pour « vous n'avez rien ».
let _surSessionExpiree: (() => unknown) | null = null

export function setReactionSessionExpiree(fn: (() => unknown) | null) {
  _surSessionExpiree = fn
}

api.interceptors.response.use(
  (reponse) => reponse,
  (erreur) => {
    if (erreur?.response?.status === 401) _surSessionExpiree?.()
    return Promise.reject(erreur)
  },
)

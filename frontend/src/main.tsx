import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { apparenceDepuisPage } from './lib/clerkApparence'
import { useTheme } from './lib/theme'
// Polices : latin et latin-ext seulement (français), rien d'inutilisé (bloc 6).
// Geist Sans : landing, connexion, inscription, tarifs, mentions légales (pas de latin-ext publié).
import '@fontsource/geist-sans/latin-400.css'
import '@fontsource/geist-sans/latin-500.css'
import '@fontsource/geist-sans/latin-600.css'
import '@fontsource/geist-sans/latin-700.css'
import './styles/polices.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-ext-400.css'
import '@fontsource/geist-mono/latin-500.css'
import '@fontsource/geist-mono/latin-ext-500.css'
import '@fontsource/geist-mono/latin-600.css'
import '@fontsource/geist-mono/latin-ext-600.css'
import './styles/theme.css'
import './styles/tokens.css'
import './index.css'
import { installerRechargementDeploiement } from './lib/rechargementDeploiement'

installerRechargementDeploiement()

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY à renseigner dans .env')
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

// Clerk suit le thème clair / nuit : l'apparence est recalculée à chaque bascule (lib/clerkApparence.ts).
function Racine() {
  const [theme] = useTheme()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- le thème est la seule entrée : les jetons sont lus sur <html>
  const appearance = useMemo(() => apparenceDepuisPage(), [theme])
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard" appearance={appearance}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Racine />
  </React.StrictMode>,
)

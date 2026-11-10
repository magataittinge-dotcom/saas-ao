import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { useSyncUser } from '@/hooks/useAuth'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import { REDIRECTIONS_ENTREPRISE } from '@/lib/entreprise/redirections'
import { retourApresConnexion } from '@/lib/sessionExpiree'
import { AdresseInconnue } from '@/components/public/EcransEtat'
import { ConnexionInterrompue, ErreurAppli, MorceauIntrouvable } from '@/components/public/EcransHorsRouteur'

// Un écran = un morceau chargé à la demande (bloc 6) : l'accueil public ne télécharge ni la
// coquille connectée, ni le Markdown, ni les étapes de l'AO.
const Layout = lazy(() => import('@/components/layout/Layout'))
const Landing = lazy(() => import('@/routes/Landing'))
const Login = lazy(() => import('@/routes/Login'))
const Register = lazy(() => import('@/routes/Register'))
const Pricing = lazy(() => import('@/routes/Pricing'))
const Legal = lazy(() => import('@/routes/Legal'))
const Dashboard = lazy(() => import('@/routes/Dashboard'))
const Projects = lazy(() => import('@/routes/Projects'))
const NewProject = lazy(() => import('@/routes/NewProject'))
const Project = lazy(() => import('@/routes/Project'))
const Vault = lazy(() => import('@/routes/Vault'))
const Company = lazy(() => import('@/routes/Company'))
const FicheEntreprise = lazy(() => import('@/routes/FicheEntreprise'))
const Settings = lazy(() => import('@/routes/Settings'))
const Billing = lazy(() => import('@/routes/Billing'))
const Tools = lazy(() => import('@/routes/Tools'))
const Design = lazy(() => import('@/routes/Design'))
const CoquillePublique = lazy(() => import('@/components/public/CoquillePublique'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null
  return isSignedIn ? <>{children}</> : <Navigate to="/login" replace />
}

// Après une session expirée (F-01), la connexion ramène à la page d'où l'on vient ; sinon, à l'accueil.
function apresConnexion(): string {
  try {
    return retourApresConnexion(window.sessionStorage) ?? '/dashboard'
  } catch {
    return '/dashboard'
  }
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  // La connexion et l'inscription affichent leur coquille tout de suite ; la carte Clerk arrive quand Clerk est prêt.
  return isLoaded && isSignedIn ? <Navigate to={apresConnexion()} replace /> : <>{children}</>
}

/**
 * Adresse inconnue : un vrai écran (404), dans la coquille de l'appli si l'on est connecté, sur le site sinon. Seule cette
 * route attend Clerk pour choisir sa coquille.
 */
function CoquilleSelonSession() {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null
  return isSignedIn ? <Layout /> : <CoquillePublique><AdresseInconnue connecte={false} /></CoquillePublique>
}

/**
 * La table des routes. Les pages publiques (site, tarifs, pages juridiques) ne lisent pas Clerk : elles s'affichent tout de
 * suite, même si le script tiers est lent ou bloqué (F-04). Seules les routes connectées, la connexion et l'inscription
 * l'attendent (PrivateRoute, PublicRoute).
 */
export function TableRoutes() {
  return (
    <Suspense fallback={<EcranEnChargement />}>
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/legal/:slug" element={<Legal />} />
      <Route
        path="/login/*"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register/*"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* Private routes — with layout */}
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/projects/:id/*" element={<Project />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/outils" element={<Tools />} />
        {/* Page de référence du système de design : interne, volontairement absente du menu */}
        <Route path="/design" element={<Design />} />
        {/* B6 — le profil mémoire vit dans Mon entreprise ; redirect propre */}
        <Route path="/memoire-config" element={<Navigate to="/company" replace />} />
        <Route path="/company" element={<Company />} />
        <Route path="/entreprise/fiche/:rubrique" element={<FicheEntreprise />} />
        {/* Équipe et Mes références sont des accès de Mon entreprise : mêmes adresses, rubrique correspondante */}
        {Object.entries(REDIRECTIONS_ENTREPRISE).map(([de, vers]) => <Route key={de} path={de} element={<Navigate to={vers} replace />} />)}
        <Route path="/settings" element={<Settings />} />
        {/* B4 — billing = sous-onglet de Paramètres ; /billing conservé en redirect */}
        <Route path="/settings/billing" element={<Billing />} />
        <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
      </Route>

      {/* Adresse inconnue : un écran, jamais un renvoi muet vers le site */}
      <Route element={<CoquilleSelonSession />}>
        <Route path="*" element={<AdresseInconnue connecte />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

function AppRoutes() {
  // Pose le fournisseur de jeton et la réaction « session expirée » ; ne retient plus l'affichage des pages publiques.
  useSyncUser()
  return <TableRoutes />
}

type Sentry = { captureException?: (erreur: unknown, contexte?: unknown) => void }

// Un morceau de code (écran chargé à la demande) qui n'arrive pas : hors ligne, ou retiré par un déploiement.
export function estMorceauIntrouvable(erreur: unknown): boolean {
  const message = erreur instanceof Error ? erreur.message : String(erreur ?? '')
  return /dynamically imported module|Importing a module script failed|Unable to preload|Loading chunk|Failed to fetch/i.test(message)
}

export type EcranErreur = 'hors-ligne' | 'morceau' | 'erreur'

// L'écran à montrer pour une erreur de rendu : connexion interrompue, morceau à recharger, ou erreur de l'appli.
export function ecranPourErreur(erreur: unknown, enLigne: boolean): EcranErreur {
  if (!enLigne) return 'hors-ligne'
  return estMorceauIntrouvable(erreur) ? 'morceau' : 'erreur'
}

// Le dernier filet : une erreur de rendu n'affiche plus rien de technique (F-02). Le détail va à la console et à Sentry
// quand il est chargé sur la page (`window.Sentry`) ; l'écran reste calme, en français, avec le geste pour repartir.
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Synorix] erreur de rendu', error, info.componentStack)
    try {
      (window as Window & { Sentry?: Sentry }).Sentry?.captureException?.(error, { extra: { componentStack: info.componentStack } })
    } catch {
      // l'envoi du rapport ne doit jamais empêcher l'écran d'erreur de s'afficher
    }
  }
  render() {
    if (this.state.error) {
      const ecran = ecranPourErreur(this.state.error, typeof navigator === 'undefined' ? true : navigator.onLine)
      return ecran === 'hors-ligne' ? <ConnexionInterrompue /> : ecran === 'morceau' ? <MorceauIntrouvable /> : <ErreurAppli />
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

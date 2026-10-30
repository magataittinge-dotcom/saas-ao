import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { useSyncUser } from '@/hooks/useAuth'
import EcranEnChargement from '@/components/common/EcranEnChargement'

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
const References = lazy(() => import('@/routes/References'))
const Company = lazy(() => import('@/routes/Company'))
const Team = lazy(() => import('@/routes/Team'))
const Settings = lazy(() => import('@/routes/Settings'))
const Billing = lazy(() => import('@/routes/Billing'))
const Tools = lazy(() => import('@/routes/Tools'))
const IntelligenceDemo = lazy(() => import('@/routes/IntelligenceDemo')) // démonstration interne, non liée au menu

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null
  return isSignedIn ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null
  return isSignedIn ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function AppRoutes() {
  const clerkReady = useSyncUser()

  // Don't render any routes until Clerk is loaded and token provider is set
  if (!clerkReady) return null

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

      <Route path="/intelligence-demo" element={<PrivateRoute><IntelligenceDemo /></PrivateRoute>} />

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
        <Route path="/references" element={<References />} />
        <Route path="/outils" element={<Tools />} />
        {/* B6 — le profil mémoire vit dans Mon entreprise ; redirect propre */}
        <Route path="/memoire-config" element={<Navigate to="/company" replace />} />
        <Route path="/company" element={<Company />} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
        {/* B4 — billing = sous-onglet de Paramètres ; /billing conservé en redirect */}
        <Route path="/settings/billing" element={<Billing />} />
        <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#F58E86', background: '#0F1218', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 20, marginBottom: 16 }}>Erreur React</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#FCA5A5' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#788295', marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#E4E9F2', color: '#0A0C11', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Recharger
          </button>
        </div>
      )
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

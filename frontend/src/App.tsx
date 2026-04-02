import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { useSyncUser } from '@/hooks/useAuth'
import Layout from '@/components/layout/Layout'
import Landing from '@/routes/Landing'
import Login from '@/routes/Login'
import Register from '@/routes/Register'
import Pricing from '@/routes/Pricing'
import Dashboard from '@/routes/Dashboard'
import Projects from '@/routes/Projects'
import NewProject from '@/routes/NewProject'
import Project from '@/routes/Project'
import Vault from '@/routes/Vault'
import References from '@/routes/References'
import Company from '@/routes/Company'
import MemoireConfig from '@/routes/MemoireConfig'
import Team from '@/routes/Team'
import Settings from '@/routes/Settings'
import Billing from '@/routes/Billing'

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
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
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
        <Route path="/references" element={<References />} />
        <Route path="/memoire-config" element={<MemoireConfig />} />
        <Route path="/company" element={<Company />} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
        <div style={{ padding: 40, color: '#F87171', background: '#0D1117', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 20, marginBottom: 16 }}>Erreur React</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#FCA5A5' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#6B7280', marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
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

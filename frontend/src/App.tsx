import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
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
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
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
    </BrowserRouter>
  )
}

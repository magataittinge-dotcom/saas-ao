import { Menu } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useCompanionStore } from '@/stores/companionStore'
import { useLocation } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import CompanionOrb from '@/components/ui/CompanionOrb'
import type { CompanionState } from '@/components/ui/CompanionOrb'

const ROUTE_LABELS: Record<string, { parent?: string; label: string }> = {
  '/dashboard':      { label: 'Tableau de bord' },
  '/projects':       { label: 'Mes AO' },
  '/projects/new':   { parent: 'Mes AO', label: 'Nouvel AO' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { label: 'Calculateurs' },
  '/memoire-config': { label: 'Mon entreprise' },
  '/company':        { label: 'Mon entreprise' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
  '/settings/billing': { label: 'Abonnement' },
}
const STEP_LABELS: Record<string, string> = { upload: 'Upload DCE', lots: 'Sélection lots', analysis: 'Analyse IA', verification: 'Vérification', candidature: 'Vérification', memoire: 'Mémoire', export: 'Export' }

const COMPANION_LABELS: Record<CompanionState, string> = {
  veille:  'Compagnon Synorix — en veille',
  reveil:  'Compagnon Synorix — réveil',
  analyse: 'Compagnon Synorix — analyse en cours',
  succes:  'Compagnon Synorix — analyse terminée',
  sommeil: 'Compagnon Synorix — repos',
}

interface Props {
  onMenuToggle: () => void
}

export default function Header({ onMenuToggle }: Props) {
  const { user } = useAuthStore()
  const companionState = useCompanionStore((s) => s.state)
  const { pathname } = useLocation()

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'
  const displayName = user?.name ?? 'Utilisateur'

  let parent: string | undefined
  let label = ''
  const projectMatch = pathname.match(/^\/projects\/[^/]+\/(\w+)/)
  if (projectMatch) { parent = 'Mes AO'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; label = match[1].label }
  }

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14"
      style={{
        background: 'rgba(9,9,10,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left side: hamburger + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg md:hidden touch-target shrink-0"
          style={{ color: '#959597' }}
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1.5 text-sm min-w-0" style={{ fontFamily: "'Inter Variable', 'Geist Sans', sans-serif" }}>
          <span className="font-display hidden sm:inline font-semibold tracking-tight" style={{ color: '#E8E9EB' }}>Synorix</span>
          <span className="hidden sm:inline" style={{ color: '#55565A' }}>&gt;</span>
          <span className="font-medium truncate" style={{ color: '#F7F8F8' }}>
            {label || parent || 'Tableau de bord'}
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Compagnon IA — état piloté par companionStore (analyse SSE, etc.) */}
        <CompanionOrb
          state={companionState}
          size={36}
          title={COMPANION_LABELS[companionState]}
        />
        {/* Notifications (C23) */}
        <NotificationBell />
        <div className="w-px h-6 hidden sm:block" style={{ background: '#1E1E21' }} />

        {/* User info + Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium leading-tight" style={{ color: '#F7F8F8', fontFamily: "'Inter Variable', 'Geist Sans', sans-serif" }}>
              {displayName}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#959597' }}>
              Chef de projet
            </p>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold cursor-default shrink-0"
            style={{
              background: 'radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0.18), transparent 65%), #121213',
              color: '#F7F8F8',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
            }}>
            {initials}
          </div>
        </div>
      </div>
    </header>
  )
}

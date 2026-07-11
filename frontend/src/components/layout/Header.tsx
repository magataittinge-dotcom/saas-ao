import { useState } from 'react'
import { Search, Menu, X, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLocation } from 'react-router-dom'
import NotificationBell from './NotificationBell'

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

interface Props {
  onMenuToggle: () => void
}

export default function Header({ onMenuToggle }: Props) {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  const [searchFocused, setSearchFocused] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

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
        background: 'rgba(10,11,13,0.85)',
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
          style={{ color: '#6B7280' }}
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1.5 text-sm min-w-0" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <span className="hidden sm:inline font-medium" style={{ color: '#22D3EE' }}>Synorix</span>
          <span className="hidden sm:inline" style={{ color: '#4B5563' }}>&gt;</span>
          <span className="font-medium truncate" style={{ color: '#E7EAEE' }}>
            {label || parent || 'Tableau de bord'}
          </span>
        </div>
      </div>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:hidden"
          style={{ background: 'rgba(0,0,0,0.20)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMobileSearchOpen(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl p-4"
            style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} style={{ color: '#22D3EE' }} />
              <span className="text-sm font-medium" style={{ color: '#E7EAEE' }}>Recherche intelligente</span>
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="ml-auto p-1.5 rounded-lg touch-target"
                style={{ color: '#6B7280' }}
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Recherche intelligente..."
              className="w-full px-4 py-3 text-sm rounded-xl outline-none"
              style={{ background: '#232730', border: '1px solid rgba(255,255,255,0.06)', color: '#E7EAEE' }}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notifications (C23) */}
        <NotificationBell />
        {/* Search — desktop */}
        <div className="relative hidden sm:block">
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#22D3EE' }} />
          <input type="text" placeholder="Recherche intelligente..."
            className="w-52 pl-9 pr-3 py-2 text-sm rounded-full outline-none transition-all duration-200"
            style={{
              background: searchFocused ? '#1A1D21' : '#0A0B0D',
              border: 'none',
              boxShadow: searchFocused
                ? 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -2px 0 0 #22D3EE, 0 8px 24px -12px rgba(34,211,238,0.35)'
                : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
              color: '#E7EAEE',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} />
        </div>
        {/* Mobile search button */}
        <button
          onClick={() => setMobileSearchOpen(true)}
          className="p-2 rounded-full sm:hidden touch-target"
          style={{ color: '#6B7280' }}
          title="Rechercher"
        >
          <Search size={18} />
        </button>

        <div className="w-px h-6 hidden sm:block" style={{ background: '#232730' }} />

        {/* User info + Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium leading-tight" style={{ color: '#E7EAEE', fontFamily: "'DM Sans', sans-serif" }}>
              {displayName}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>
              Chef de projet
            </p>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold cursor-default shrink-0"
            style={{
              background: 'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.18), transparent 65%), #121417',
              color: '#E7EAEE',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
            }}>
            {initials}
          </div>
        </div>
      </div>
    </header>
  )
}

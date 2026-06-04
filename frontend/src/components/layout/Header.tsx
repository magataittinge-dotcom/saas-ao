import { useState } from 'react'
import { Search, Bell, Menu, X, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLocation } from 'react-router-dom'

const ROUTE_LABELS: Record<string, { parent?: string; label: string }> = {
  '/dashboard':      { label: 'Tableau de bord' },
  '/projects':       { label: 'Projets' },
  '/projects/new':   { parent: 'Projets', label: 'Nouveau projet' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { label: 'Calculateurs' },
  '/memoire-config': { label: 'Mémoire Technique' },
  '/company':        { label: 'Mon Entreprise' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
}
const STEP_LABELS: Record<string, string> = { upload: 'Upload DCE', lots: 'Sélection lots', analysis: 'Analyse IA', candidature: 'Candidature', memoire: 'Mémoire', export: 'Export' }

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
  if (projectMatch) { parent = 'Projets'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; label = match[1].label }
  }

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      {/* Left side: hamburger + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg md:hidden touch-target shrink-0"
          style={{ color: '#94A3B8' }}
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1.5 text-sm min-w-0" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <span className="hidden sm:inline font-medium" style={{ color: '#0EA5E9' }}>Synorix</span>
          <span className="hidden sm:inline" style={{ color: '#CBD5E1' }}>&gt;</span>
          <span className="font-medium truncate" style={{ color: '#0F172A' }}>
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
            style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} style={{ color: '#0EA5E9' }} />
              <span className="text-sm font-medium" style={{ color: '#0F172A' }}>Recherche intelligente</span>
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="ml-auto p-1.5 rounded-lg touch-target"
                style={{ color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Recherche intelligente..."
              className="w-full px-4 py-3 text-sm rounded-xl outline-none"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A' }}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Search — desktop */}
        <div className="relative hidden sm:block">
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#0EA5E9' }} />
          <input type="text" placeholder="Recherche intelligente..."
            className="w-52 pl-9 pr-3 py-2 text-sm rounded-full outline-none transition-all duration-200"
            style={{
              background: searchFocused ? '#FFFFFF' : '#F1F5F9',
              border: searchFocused ? '1px solid #0EA5E9' : '1px solid transparent',
              color: '#0F172A',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} />
        </div>
        {/* Mobile search button */}
        <button
          onClick={() => setMobileSearchOpen(true)}
          className="p-2 rounded-full sm:hidden touch-target"
          style={{ color: '#94A3B8' }}
          title="Rechercher"
        >
          <Search size={18} />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-full transition-colors touch-target" title="Notifications"
          style={{ color: '#94A3B8' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8' }}>
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />
        </button>

        <div className="w-px h-6 hidden sm:block" style={{ background: '#E2E8F0' }} />

        {/* User info + Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium leading-tight" style={{ color: '#0F172A', fontFamily: "'DM Sans', sans-serif" }}>
              {displayName}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
              Chef de projet
            </p>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-default shrink-0"
            style={{ background: '#0EA5E9' }}>
            {initials}
          </div>
        </div>
      </div>
    </header>
  )
}

import { useState } from 'react'
import { Search, Bell } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLocation } from 'react-router-dom'

const ROUTE_LABELS: Record<string, { parent?: string; label: string }> = {
  '/dashboard':      { label: 'Tableau de bord' },
  '/projects':       { label: 'Projets' },
  '/projects/new':   { parent: 'Projets', label: 'Nouveau projet' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/memoire-config': { label: 'Mémoire Technique' },
  '/company':        { label: 'Mon Entreprise' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
}
const STEP_LABELS: Record<string, string> = { upload: 'Upload DCE', lots: 'Sélection lots', analysis: 'Analyse IA', candidature: 'Candidature', memoire: 'Mémoire', export: 'Export' }

export default function Header() {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  const [searchFocused, setSearchFocused] = useState(false)

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'

  let parent: string | undefined
  let label = ''
  const projectMatch = pathname.match(/^\/projects\/[^/]+\/(\w+)/)
  if (projectMatch) { parent = 'Projets'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; label = match[1].label }
  }

  return (
    <header className="glass-header sticky top-0 z-40 mx-4 mt-4 rounded-[20px] flex items-center justify-between px-5 py-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <span style={{ color: 'var(--text-muted)' }}>{parent ?? 'Synorix'}</span>
        {label && (<><span style={{ color: 'var(--text-muted)' }}>/</span><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span></>)}
      </div>

      {/* Right — Horizon navbar pill */}
      <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.15)' }}>
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Rechercher..."
            className="w-44 pl-9 pr-3 py-2 text-sm rounded-full outline-none transition-all duration-200"
            style={{
              background: searchFocused ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.04)',
              border: 'none', color: 'var(--text-primary)',
              boxShadow: searchFocused ? '0 0 0 2px rgba(59,130,246,0.2)' : 'none',
            }}
            onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-full transition-all duration-200" title="Notifications"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: '#EF4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
        </button>

        {/* Separator */}
        <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-default"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)', boxShadow: '0 0 15px rgba(59,130,246,0.3)', border: '2px solid rgba(59,130,246,0.3)' }}>
          {initials}
        </div>
      </div>
    </header>
  )
}

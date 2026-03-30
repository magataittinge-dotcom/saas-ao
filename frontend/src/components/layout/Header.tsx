import { Bell } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLocation } from 'react-router-dom'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':      'Dashboard',
  '/projects':       'Mes AO',
  '/projects/new':   'Nouvel AO',
  '/vault':          'Coffre-fort',
  '/references':     'Références',
  '/memoire-config': 'Mémoire Technique',
  '/company':        'Mon Entreprise',
  '/team':           'Équipe',
  '/settings':       'Paramètres',
}

export default function Header() {
  const { user } = useAuthStore()
  const { pathname } = useLocation()

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const label = Object.entries(ROUTE_LABELS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([route]) => pathname.startsWith(route))?.[1] ?? ''

  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0"
      style={{
        background: 'rgba(8,11,18,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(14,165,233,0.08)',
        boxShadow: '0 1px 0 rgba(14,165,233,0.04)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-medium"
          style={{ color: '#334155', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
        >
          Synorix
        </span>
        {label && (
          <>
            <span className="text-xs" style={{ color: '#1E293B' }}>/</span>
            <span
              className="text-xs font-semibold"
              style={{ color: '#94A3B8', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
            >
              {label}
            </span>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5">
        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg transition-all duration-200"
          style={{ color: '#475569' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#94A3B8'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#475569'
            e.currentTarget.style.background = 'transparent'
          }}
          title="Notifications"
        >
          <Bell size={16} />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: '#0EA5E9', boxShadow: '0 0 6px rgba(14,165,233,0.8)' }}
          />
        </button>

        {/* Separator */}
        <div className="w-px h-5" style={{ background: 'rgba(14,165,233,0.10)' }} />

        {/* User */}
        <div className="flex items-center gap-2.5 cursor-default">
          <div className="avatar-ring">
            <div
              className="avatar-inner text-white font-semibold"
              style={{ width: '1.875rem', height: '1.875rem', fontSize: '0.7rem' }}
            >
              {initials}
            </div>
          </div>
          <span
            className="text-sm font-medium hidden sm:block"
            style={{ color: '#94A3B8', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
          >
            {user?.name}
          </span>
        </div>
      </div>
    </header>
  )
}

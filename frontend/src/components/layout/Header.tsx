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
        background: 'rgba(8,11,18,0.80)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(14,165,233,0.08)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ds-text-3 font-medium">Synorix</span>
        {label && (
          <>
            <span className="text-ds-text-3 text-xs">/</span>
            <span className="text-xs font-semibold text-ds-text">{label}</span>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <button className="relative p-2 text-ds-text-2 hover:text-ds-text rounded-lg hover:bg-white/5 transition-colors">
          <Bell size={17} />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: '#0EA5E9', boxShadow: '0 0 6px rgba(14,165,233,0.8)' }}
          />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="avatar-ring">
            <div
              className="avatar-inner text-white font-semibold"
              style={{ width: '1.875rem', height: '1.875rem', fontSize: '0.75rem' }}
            >
              {initials}
            </div>
          </div>
          <span className="text-sm font-medium text-ds-text hidden sm:block">{user?.name}</span>
        </div>
      </div>
    </header>
  )
}

import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, FileStack, Building2, Archive, Users, CreditCard, LogOut,
  Settings, X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/projects',       icon: FolderOpen,      label: 'Projets' },
  { to: '/memoire-config', icon: FileStack,       label: 'Mémoires techniques' },
  { to: '/references',     icon: Building2,       label: 'Références' },
  { to: '/vault',          icon: Archive,         label: 'Coffre-fort' },
  { to: '/team',           icon: Users,           label: 'Équipe' },
  { to: '/billing',        icon: CreditCard,      label: 'Facturation' },
  { to: '/settings',       icon: Settings,        label: 'Paramètres' },
]

const PLAN_PILL: Record<string, { label: string; pillClass: string }> = {
  free:     { label: 'Free',     pillClass: 'bg-[#1C222D] text-[#9BA4B5]' },
  pro:      { label: 'Pro',      pillClass: 'pill-pro' },
  business: { label: 'Business', pillClass: 'pill-entreprise' },
}

interface Props {
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const handleLogout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, organization } = useAuthStore()

  const planKey = (organization?.plan || 'free') as string
  const pill = PLAN_PILL[planKey] ?? PLAN_PILL.free
  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'

  useEffect(() => { onMobileClose() }, [location.pathname, onMobileClose])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  const expanded = mobileOpen || hoverExpanded

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(0,0,0,.55)' }}
          onClick={onMobileClose}
        />
      )}

      <aside
        onMouseEnter={() => setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
        className={cn(
          'glass-sidebar flex flex-col shrink-0 transition-all duration-300 ease-in-out',
          'fixed md:relative z-40',
          mobileOpen
            ? 'translate-x-0 w-[240px]'
            : '-translate-x-full md:translate-x-0',
          !mobileOpen && (hoverExpanded ? 'md:w-[240px]' : 'md:w-16'),
          'h-full',
        )}
      >
        {/* ── Logo ─────────────────────────────────── */}
        <div className="h-16 flex items-center shrink-0 overflow-hidden"
          style={{ borderBottom: '1px solid rgba(186,205,234,.13)' }}>
          <div className={cn('flex items-center gap-2.5 transition-all duration-300 flex-1', expanded ? 'px-4' : 'px-0 justify-center w-full')}>
            <div className="logo-synorix"><span className="logo-synorix-text">S</span></div>
            {expanded && (
              <span className="font-black text-xl tracking-tight whitespace-nowrap font-display"
                style={{ color: '#F4F6FA' }}>
                Synorix
              </span>
            )}
          </div>
          {mobileOpen && (
            <button
              onClick={onMobileClose}
              className="p-2 mr-2 rounded-lg md:hidden touch-target"
              style={{ color: '#788295' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* ── Nav label ──────────────────────────── */}
        {expanded && (
          <div className="px-4 pt-4 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#788295' }}>Menu</span>
          </div>
        )}

        {/* ── Nav items ──────────────────────────── */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map(({ to, icon: Icon, label }) => (
            <div key={to} className="relative group">
              <NavLink to={to}
                className={() => cn('glass-nav touch-target', !expanded && 'justify-center px-0')}
                style={({ isActive }) => isActive ? { background: 'rgba(228,233,242,0.10)', color: '#E4E9F2' } : undefined}
                onMouseEnter={(e) => {
                  if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                    e.currentTarget.style.background = '#1C222D'
                    e.currentTarget.style.color = '#F4F6FA'
                  }
                }}
                onMouseLeave={(e) => {
                  if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = ''
                  }
                }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                        style={{ height: '60%', background: '#E9EDF5' }} />
                    )}
                    <Icon size={18} className="shrink-0" style={{ color: isActive ? '#E4E9F2' : undefined }} />
                    {expanded && (
                      <span className="truncate text-[13px]">{label}</span>
                    )}
                  </>
                )}
              </NavLink>
              {!expanded && <Tooltip label={label} />}
            </div>
          ))}
        </nav>

        {/* ── Plan badge ── */}
        <div className="border-t border-[rgba(186,205,234,.13)]">
          {expanded ? (
            <div className="flex items-center gap-2 px-4 h-10">
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none', pill.pillClass)}>
                {pill.label}
              </span>
              {planKey === 'free' && (
                <button
                  onClick={() => navigate('/billing')}
                  className="text-[10px] text-[#E4E9F2] hover:text-[#C3CCDC] transition-colors ml-auto"
                >
                  Upgrade
                </button>
              )}
            </div>
          ) : (
            <div className="relative group flex justify-center h-10 items-center">
              <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold leading-none', pill.pillClass)}>
                {pill.label.charAt(0)}
              </span>
              <Tooltip label={`Plan ${pill.label}`} />
            </div>
          )}
        </div>

        {/* ── User + Logout ─────────────────────── */}
        <div className="border-t border-[rgba(186,205,234,.13)] p-2">
          <div className={cn('flex items-center gap-2.5 rounded-lg p-2 transition-all duration-200', expanded ? '' : 'justify-center')}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #F4F6FA, #9FA9BC)' }}>
              {initials}
            </div>
            {expanded && (
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#F4F6FA] truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-[10px] text-[#788295] truncate">{user?.email || ''}</p>
              </div>
            )}
            {expanded && (
              <button onClick={handleLogout}
                className="p-1.5 rounded-md transition-colors hover:bg-[#1C222D] touch-target"
                style={{ color: '#788295' }}
                title="Déconnexion"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
          {!expanded && (
            <div className="relative group">
              <button onClick={handleLogout}
                className="w-full flex justify-center py-1.5 transition-colors touch-target"
                style={{ color: '#788295' }}
              >
                <LogOut size={14} />
              </button>
              <Tooltip label="Déconnexion" />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function Tooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 hidden md:block"
      style={{ color: '#F4F6FA', background: '#151A23', border: '1px solid rgba(186,205,234,.13)', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,.5)' }}>
      {label}
    </div>
  )
}

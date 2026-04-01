import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Building2, Archive, Users, CreditCard, LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/projects',   icon: FolderOpen,      label: 'Projets' },
  { to: '/references', icon: Building2,       label: 'Références' },
  { to: '/vault',      icon: Archive,         label: 'Coffre-fort' },
  { to: '/team',       icon: Users,           label: 'Équipe' },
  { to: '/billing',    icon: CreditCard,      label: 'Facturation' },
]

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const handleLogout = useLogout()
  const { organization } = useAuthStore()

  const usedAO = 3
  const maxAO = 15
  const planLabel = organization?.plan === 'enterprise' ? 'Enterprise'
    : organization?.plan === 'starter' ? 'Starter' : 'Pro'

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'glass-sidebar flex flex-col shrink-0 transition-all duration-300 ease-in-out relative z-20',
        expanded ? 'w-[260px]' : 'w-[72px]',
      )}
    >
      {/* ── Logo ─────────────────────────────────── */}
      <div className="h-16 flex items-center shrink-0 overflow-hidden"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className={cn('flex items-center gap-2.5 transition-all duration-300', expanded ? 'px-4' : 'px-0 justify-center w-full')}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)', boxShadow: '0 0 25px rgba(59,130,246,0.5)' }}>
            <span className="text-white font-black text-base" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>S</span>
          </div>
          <span className="font-black text-xl tracking-tight whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #60A5FA, #22D3EE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              opacity: expanded ? 1 : 0, transition: 'opacity 0.2s ease 0.15s', width: expanded ? 'auto' : 0, overflow: 'hidden',
            }}>
            Synorix
          </span>
        </div>
      </div>

      {/* ── Nav label ──────────────────────────── */}
      {expanded && (
        <div className="px-4 pt-4 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Menu</span>
        </div>
      )}

      {/* ── Nav items ──────────────────────────── */}
      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map(({ to, icon: Icon, label }) => (
          <div key={to} className="relative group">
            <NavLink to={to}
              className={() => cn('glass-nav', !expanded && 'justify-center px-0')}
              style={({ isActive }) => isActive ? { background: 'rgba(59,130,246,0.12)', color: '#60A5FA' } : undefined}
              onMouseEnter={(e) => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
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
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 rounded-l-full"
                      style={{ height: '60%', background: '#3B82F6', boxShadow: '0 0 10px rgba(59,130,246,0.6)' }} />
                  )}
                  <Icon size={18} className="shrink-0" style={{ color: isActive ? '#3B82F6' : undefined }} />
                  {expanded && (
                    <span className="truncate" style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.2s ease 0.15s' }}>{label}</span>
                  )}
                </>
              )}
            </NavLink>
            {!expanded && <Tooltip label={label} />}
          </div>
        ))}
      </nav>

      <div className="mx-3" style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

      {/* ── Plan card (Horizon sidebar card style) ── */}
      <div className={cn('px-3 py-3', !expanded && 'flex justify-center')}>
        {expanded ? (
          <div className="rounded-[20px] p-4 text-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(96,165,250,0.08))', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}>
              <span className="text-sm font-bold text-white">{planLabel[0]}</span>
            </div>
            <span className="text-xs font-semibold block" style={{ color: 'var(--text-primary)' }}>Plan {planLabel}</span>
            <div className="flex items-center justify-between mt-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{usedAO} AO</span><span>{maxAO} max</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min((usedAO / maxAO) * 100, 100)}%`, background: 'linear-gradient(90deg, #3B82F6, #60A5FA)' }} />
            </div>
          </div>
        ) : (
          <div className="relative group">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ color: '#60A5FA', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.18)' }}>
              {planLabel[0]}
            </div>
            <Tooltip label={`Plan ${planLabel} — ${usedAO}/${maxAO} AO`} />
          </div>
        )}
      </div>

      {/* ── Logout ─────────────────────────────── */}
      <div className="relative group">
        <button onClick={handleLogout}
          className={cn('w-full flex items-center gap-2 py-3 text-xs font-medium transition-all duration-200', expanded ? 'px-4' : 'justify-center px-2')}
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
          <LogOut size={15} className="shrink-0" />
          {expanded && <span style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.2s ease 0.15s' }}>Déconnexion</span>}
        </button>
        {!expanded && <Tooltip label="Déconnexion" />}
      </div>
    </aside>
  )
}

function Tooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
      style={{ color: 'var(--text-primary)', background: '#111C44', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.25)' }}>
      {label}
    </div>
  )
}

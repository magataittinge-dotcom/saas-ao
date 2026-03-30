import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Archive,
  Building2,
  Building,
  FileText,
  Users,
  Settings,
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useLogout } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects',      icon: FolderOpen,      label: 'Mes AO' },
  { to: '/vault',         icon: Archive,         label: 'Coffre-fort' },
  { to: '/references',    icon: Building2,       label: 'Références' },
  { to: '/memoire-config',icon: FileText,        label: 'Mémoire Technique' },
  { to: '/company',       icon: Building,        label: 'Mon Entreprise' },
  { to: '/team',          icon: Users,           label: 'Équipe' },
  { to: '/settings',      icon: Settings,        label: 'Paramètres' },
]

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

export default function Sidebar() {
  const navigate = useNavigate()
  const logout = useLogout()
  const { user, organization } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  return (
    <aside
      style={{
        background: 'linear-gradient(180deg, #0A0E1A 0%, #080B12 100%)',
        borderRight: '1px solid rgba(14,165,233,0.10)',
        boxShadow: 'inset -1px 0 0 rgba(14,165,233,0.04)',
      }}
      className={cn(
        'flex flex-col shrink-0 transition-all duration-300 ease-smooth',
        sidebarCollapsed ? 'w-16' : 'w-[220px]',
      )}
    >
      {/* ── Logo ─────────────────────────────────── */}
      <div
        className="h-16 flex items-center justify-between px-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(14,165,233,0.08)' }}
      >
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden pl-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
                boxShadow: '0 0 14px rgba(14,165,233,0.40)',
              }}
            >
              <Sparkles size={13} className="text-white" />
            </div>
            <span
              className="text-gradient font-bold text-[17px] tracking-tight whitespace-nowrap"
              style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
            >
              SYNORIX
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div
            className="mx-auto w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)',
              boxShadow: '0 0 14px rgba(14,165,233,0.40)',
            }}
          >
            <Sparkles size={13} className="text-white" />
          </div>
        )}
        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-ds-text-3 hover:text-ds-text hover:bg-white/5 transition-colors shrink-0"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* ── CTA Nouvel AO ─────────────────────────── */}
      <div className="px-2.5 pt-4 pb-2">
        {sidebarCollapsed ? (
          <div className="relative group">
            <button
              onClick={() => navigate('/projects/new')}
              className="w-full flex items-center justify-center p-2 btn-primary rounded-xl"
            >
              <Plus size={17} />
            </button>
            <Tooltip label="Nouvel AO" />
          </div>
        ) : (
          <button
            onClick={() => navigate('/projects/new')}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
          >
            <Plus size={15} />
            <span>Nouvel AO</span>
          </button>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────── */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map(({ to, icon: Icon, label }) => (
          <div key={to} className="relative group">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn('nav-item', sidebarCollapsed && 'justify-center px-0', isActive && 'active')
              }
            >
              <Icon size={17} className="shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
            {sidebarCollapsed && <Tooltip label={label} />}
          </div>
        ))}
      </nav>

      {/* ── Toggle (collapsed) ───────────────────── */}
      {sidebarCollapsed && (
        <div className="px-2 pb-2">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-1.5 text-ds-text-3 hover:text-ds-text hover:bg-white/5 rounded-md transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* ── Divider ──────────────────────────────── */}
      <div className="divider mx-3" />

      {/* ── Profile ──────────────────────────────── */}
      <div className={cn('px-3 py-3', sidebarCollapsed && 'px-1.5')}>
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="avatar-ring shrink-0">
              <div className="avatar-inner w-7 h-7 text-xs text-white">{initials}</div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-ds-text truncate">{user?.name}</p>
              <span className="pill pill-cyan text-[10px] px-1.5 py-0 inline-flex">
                {PLAN_LABELS[organization?.plan ?? ''] ?? organization?.plan ?? 'Free'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center relative group">
            <div className="avatar-ring">
              <div className="avatar-inner w-7 h-7 text-xs text-white">{initials}</div>
            </div>
            <Tooltip label={user?.name ?? ''} />
          </div>
        )}
      </div>

      {/* ── Logout ───────────────────────────────── */}
      <div className="relative group">
        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-2 px-4 py-3 text-xs text-ds-text-3 hover:text-ds-text',
            'transition-colors hover:bg-white/[0.03]',
            sidebarCollapsed && 'justify-center px-2',
          )}
          style={{ borderTop: '1px solid rgba(14,165,233,0.08)' }}
        >
          <LogOut size={14} className="shrink-0" />
          {!sidebarCollapsed && 'Déconnexion'}
        </button>
        {sidebarCollapsed && <Tooltip label="Déconnexion" />}
      </div>
    </aside>
  )
}

function Tooltip({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 text-ds-text text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
      style={{ background: '#0F172A', border: '1px solid rgba(14,165,233,0.15)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
    >
      {label}
      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: 'rgba(14,165,233,0.15)' }} />
    </div>
  )
}

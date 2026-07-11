import { useState, useEffect, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Building2, Archive, Users, LogOut,
  Settings, X, Calculator, Briefcase, Plus,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProject'
import { cn } from '@/lib/utils'
import QuotaGauge from './QuotaGauge'

// B4 — structure cible PRD §4 : [+ Nouvel AO] hors nav · TRAVAIL · MON
// CAPITAL · jauge quota · Paramètres en bas (billing = sous-onglet de
// Paramètres). Le pipeline n'apparaît JAMAIS ici.
const SECTIONS: { label: string; items: { to: string; icon: typeof LayoutDashboard; label: string }[] }[] = [
  {
    label: 'Travail',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
      { to: '/projects',  icon: FolderOpen,      label: 'Mes AO' },
    ],
  },
  {
    label: 'Mon capital',
    items: [
      { to: '/company',        icon: Briefcase,  label: 'Mon entreprise' },
      { to: '/references',     icon: Building2,  label: 'Mes références' },
      { to: '/vault',          icon: Archive,    label: 'Coffre-fort' },
      
      { to: '/outils',         icon: Calculator, label: 'Calculateurs' },
    ],
  },
]

const BOTTOM_ITEMS = [
  { to: '/team',     icon: Users,    label: 'Équipe' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

const PLAN_PILL: Record<string, { label: string; pillClass: string }> = {
  free:     { label: 'Free',     pillClass: 'bg-[#232730] text-[#9AA3AE]' },
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
  const { data: projects = [] } = useProjects()

  const planKey = (organization?.plan || 'free') as string
  const pill = PLAN_PILL[planKey] ?? PLAN_PILL.free
  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'

  // Badge deadline sur « Mes AO » : au moins un AO actif avec une échéance < 7 j.
  const urgentCount = useMemo(() => {
    const closed = new Set(['soumis', 'gagné', 'perdu'])
    let count = 0
    for (const p of projects) {
      if (closed.has(p.status)) continue
      const raw = p.deadline || p.infos_marche?.date_limite_reponse
      if (!raw) continue
      const d = new Date(raw)
      if (isNaN(d.getTime())) continue
      const days = (d.getTime() - Date.now()) / 86400000
      if (days >= 0 && days < 7) count += 1
    }
    return count
  }, [projects])

  useEffect(() => { onMobileClose() }, [location.pathname, onMobileClose])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  const expanded = mobileOpen || hoverExpanded

  const renderItem = ({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) => (
    <div key={to} className="relative group">
      {/* Edge : l'état actif = ligne d'horizon cyan (glass-nav.active),
          hover en CSS — plus aucun style inline ni handler JS. */}
      <NavLink to={to}
        className={({ isActive }) =>
          cn('glass-nav touch-target', isActive && 'active', !expanded && 'justify-center px-0')}
      >
        {({ isActive }) => (
          <>
            <span className="relative shrink-0">
              <Icon size={18} style={{ color: isActive ? '#22D3EE' : undefined }} />
              {to === '/projects' && urgentCount > 0 && !expanded && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: '#F87171' }} />
              )}
            </span>
            {expanded && (
              <span className="truncate text-[13px] flex-1">{label}</span>
            )}
            {expanded && to === '/projects' && urgentCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0"
                style={{ background: 'rgba(248,113,113,0.10)', color: '#F87171' }}
                title={`${urgentCount} AO avec une échéance sous 7 jours`}
              >
                {urgentCount}
              </span>
            )}
          </>
        )}
      </NavLink>
      {!expanded && <Tooltip label={label} />}
    </div>
  )

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(0,0,0,0.20)' }}
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
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className={cn('flex items-center gap-2.5 transition-all duration-300 flex-1', expanded ? 'px-4' : 'px-0 justify-center w-full')}>
            <div className="logo-synorix"><span className="logo-synorix-text">S</span></div>
            {expanded && (
              <span className="font-black text-xl tracking-tight whitespace-nowrap font-display"
                style={{ color: '#E7EAEE' }}>
                Synorix
              </span>
            )}
          </div>
          {mobileOpen && (
            <button
              onClick={onMobileClose}
              className="p-2 mr-2 rounded-lg md:hidden touch-target"
              style={{ color: '#6B7280' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* ── [+ Nouvel AO] — bouton primaire hors nav ── */}
        <div className={cn('pt-3 pb-1', expanded ? 'px-3' : 'px-2')}>
          <div className="relative group">
            <button
              onClick={() => navigate('/projects/new')}
              className="signature-btn w-full justify-center py-2 text-[13px] touch-target"
            >
              <Plus size={16} className="shrink-0" />
              {expanded && <span className="whitespace-nowrap">Nouvel AO</span>}
            </button>
            {!expanded && <Tooltip label="Nouvel AO" />}
          </div>
        </div>

        {/* ── Sections TRAVAIL / MON CAPITAL ────────── */}
        <nav className="flex-1 py-1 px-2 overflow-y-auto overflow-x-hidden">
          {SECTIONS.map((section) => (
            <div key={section.label} className="mb-1">
              {expanded && (
                <div className="px-2 pt-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#6B7280' }}>
                    {section.label}
                  </span>
                </div>
              )}
              {!expanded && <div className="pt-3" />}
              <div className="space-y-0.5">
                {section.items.map(renderItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Équipe + Paramètres (bas) ─────────────── */}
        <div className="px-2 py-1 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {BOTTOM_ITEMS.map(renderItem)}
        </div>

        {/* ── Jauge quota (C17) — cliquable vers l'abonnement ── */}
        {expanded && <QuotaGauge />}

        {/* ── Plan badge ── */}
        <div className="border-t border-[#232730]">
          {expanded ? (
            <div className="flex items-center gap-2 px-4 h-10">
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none', pill.pillClass)}>
                {pill.label}
              </span>
              {planKey === 'free' && (
                <button
                  onClick={() => navigate('/settings/billing')}
                  className="text-[10px] text-[#22D3EE] hover:text-[#67E8F9] transition-colors ml-auto"
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
        <div className="border-t border-[#232730] p-2">
          <div className={cn('flex items-center gap-2.5 rounded-lg p-2 transition-all duration-200', expanded ? '' : 'justify-center')}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{
                background: 'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.18), transparent 65%), #121417',
                color: '#E7EAEE',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
              }}>
              {initials}
            </div>
            {expanded && (
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#E7EAEE] truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-[10px] text-[#6B7280] truncate">{user?.email || ''}</p>
              </div>
            )}
            {expanded && (
              <button onClick={handleLogout}
                className="p-1.5 rounded-md transition-colors hover:bg-[#232730] touch-target"
                style={{ color: '#6B7280' }}
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
                style={{ color: '#6B7280' }}
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
      style={{ color: '#E7EAEE', background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      {label}
    </div>
  )
}

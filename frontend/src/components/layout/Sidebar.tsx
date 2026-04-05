import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, FileStack, Building2, Archive, Users, CreditCard, LogOut,
  Sparkles, Zap, Crown, ArrowRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/projects',   icon: FolderOpen,      label: 'Projets' },
  { to: '/memoire-config', icon: FileStack,   label: 'Mémoires techniques' },
  { to: '/references', icon: Building2,       label: 'Références' },
  { to: '/vault',      icon: Archive,         label: 'Coffre-fort' },
  { to: '/team',       icon: Users,           label: 'Équipe' },
  { to: '/billing',    icon: CreditCard,      label: 'Facturation' },
]

const PLAN_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string; colorLight: string; bg: string; border: string; gradient: string; maxAO: number | null }> = {
  free: {
    label: 'Gratuit', icon: Sparkles, color: '#64748B', colorLight: '#94A3B8',
    bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.20)', gradient: 'linear-gradient(135deg, #64748B, #94A3B8)',
    maxAO: 1,
  },
  pro: {
    label: 'Pro', icon: Zap, color: '#3B82F6', colorLight: '#60A5FA',
    bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.22)', gradient: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
    maxAO: 15,
  },
  business: {
    label: 'Business', icon: Crown, color: '#8B5CF6', colorLight: '#A78BFA',
    bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.22)', gradient: 'linear-gradient(135deg, #7C3AED, #A78BFA)',
    maxAO: null, // unlimited
  },
}

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const handleLogout = useLogout()
  const navigate = useNavigate()
  const { organization } = useAuthStore()

  const planKey = (organization?.plan || 'free') as string
  const cfg = PLAN_CONFIG[planKey] ?? PLAN_CONFIG.free
  const PlanIcon = cfg.icon
  const maxAO = cfg.maxAO

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

      {/* ── Plan card ── */}
      <div className={cn('px-3 py-3', !expanded && 'flex justify-center')}>
        {expanded ? (
          <div className="rounded-[20px] p-4 text-center relative overflow-hidden"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
              style={{ background: cfg.gradient, boxShadow: `0 4px 12px ${cfg.color}40` }}>
              <PlanIcon size={18} className="text-white" />
            </div>
            <span className="text-xs font-semibold block" style={{ color: cfg.colorLight }}>Plan {cfg.label}</span>
            <span className="text-[10px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
              {maxAO === null ? 'AO illimités' : `${maxAO} AO / mois`}
            </span>

            {/* Upgrade CTA for free plan */}
            {planKey === 'free' && (
              <button
                onClick={() => navigate('/billing')}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
              >
                Passer à Pro <ArrowRight size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="relative group">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ color: cfg.colorLight, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <PlanIcon size={16} />
            </div>
            <Tooltip label={`Plan ${cfg.label} — ${maxAO === null ? '∞' : maxAO} AO/mois`} />
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

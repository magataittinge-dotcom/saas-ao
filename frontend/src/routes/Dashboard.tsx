import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, FolderOpen, ArrowRight, ArrowUpRight, ArrowDownRight,
  Clock, ChevronRight, Brain, BarChart3, Shield, Target,
  TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { AOCard } from '@/components/dashboard/AOCard'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { SkeletonCard } from '@/components/common/Skeleton'
import type { Project, DashboardStats } from '@/types'

/* ═══════════════════════════════════════════════════════════════
   AI COMMAND CENTER — Design Tokens
   ═══════════════════════════════════════════════════════════════ */
const T = {
  bg:       '#050508',
  card:     'rgba(12,17,30,0.55)',
  cardH:    'rgba(16,22,38,0.65)',
  brd:      'rgba(255,255,255,0.04)',
  brdH:     'rgba(255,255,255,0.08)',
  t1:       '#E8ECF4',
  t2:       '#8B95A9',
  t3:       '#556177',
  accent:   '#3B82F6',
  accentL:  '#7CB3FF',
  accentBg: 'rgba(59,130,246,0.08)',
  green:    '#34D399',
  greenBg:  'rgba(52,211,153,0.08)',
  red:      '#F87171',
  redBg:    'rgba(248,113,113,0.08)',
  amber:    '#FBBF24',
  amberBg:  'rgba(251,191,36,0.08)',
  cyan:     '#22D3EE',
  cyanBg:   'rgba(34,211,238,0.08)',
}

const F = {
  display: "'Outfit', sans-serif",
  ui:      "'DM Sans', sans-serif",
  mono:    "'JetBrains Mono', monospace",
}

/* ── Card primitive ──────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: T.card,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${T.brd}`,
  borderRadius: 12,
  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
}

/* ── Layered shadows ─────────────────────────────────────────── */
const deepShadow = '0 2px 4px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.20), 0 0 0 1px rgba(255,255,255,0.02)'
const deepShadowHover = '0 4px 8px rgba(0,0,0,0.30), 0 12px 32px rgba(0,0,0,0.25), 0 0 20px rgba(59,130,246,0.05), 0 0 0 1px rgba(255,255,255,0.04)'

/* ── Demo fallback ───────────────────────────────────────────── */
const DEMO: DashboardStats = {
  projects_en_cours: 7,
  projects_soumis_ce_mois: 3,
  projects_gagnes: 5,
  taux_succes: 94,
  documents_expires: 1,
  documents_expirant_bientot: 5,
}

/* ── CountUp ─────────────────────────────────────────────────── */
function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const t0 = performance.now()
    const from = prev.current
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (target - from) * ease))
      if (p < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, dur])
  return v
}

/* ── Live clock ──────────────────────────────────────────────── */
function useLiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/* ── Stat cards config ───────────────────────────────────────── */
const STATS = [
  { key: 'projects_en_cours' as keyof DashboardStats, label: 'AO en cours', icon: BarChart3, dot: T.accent, trend: '+2', up: true, suffix: '', demo: 7 },
  { key: 'taux_succes' as keyof DashboardStats, label: 'Taux conformité', icon: Shield, dot: T.green, trend: '+5.2%', up: true, suffix: '%', demo: 94 },
  { key: 'projects_gagnes' as keyof DashboardStats, label: 'AO gagnés', icon: Target, dot: T.cyan, trend: '+1', up: true, suffix: '', demo: 5 },
  { key: 'projects_soumis_ce_mois' as keyof DashboardStats, label: 'CA en cours', icon: TrendingUp, dot: T.amber, trend: '-', up: false, suffix: 'k', demo: 842, isAmount: true },
]

/* ── Activity data ───────────────────────────────────────────── */
const ACTIVITY = [
  { label: 'Mémoire technique généré',  time: 'Il y a 2h', color: T.accent, badge: 'Mémoire',  bg: T.accentBg },
  { label: 'Analyse IA terminée',       time: 'Il y a 5h', color: T.green,  badge: 'Analyse',  bg: T.greenBg },
  { label: '3 documents uploadés',      time: 'Hier',      color: T.cyan,   badge: 'Upload',   bg: T.cyanBg },
  { label: 'Nouveau projet créé',       time: 'Il y a 2j', color: T.amber,  badge: 'Nouveau',  bg: T.amberBg },
  { label: 'AO soumis avec succès',     time: 'Il y a 3j', color: T.green,  badge: 'Soumis',   bg: T.greenBg },
]

/* ── Format helpers ──────────────────────────────────────────── */
function fmtDate(d: Date) {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).replace(/^\w/, (c) => c.toUpperCase())
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/* ═══════════════════════════════════════════════════════════════
   INSIGHTS PANEL
   ═══════════════════════════════════════════════════════════════ */
function InsightsPanel() {
  const cx = 56, cy = 56, r = 42
  const C = 2 * Math.PI * r
  const slices = [
    { label: 'Gagnés', pct: 0.67, color: T.accent },
    { label: 'En cours', pct: 0.21, color: T.cyan },
    { label: 'Perdus', pct: 0.12, color: T.red },
  ]
  let off = 0

  const bars = [
    { label: 'AO déposés',     pct: 75, color: T.accent },
    { label: 'Taux de succès', pct: 67, color: T.green },
    { label: 'Conformité',     pct: 94, color: T.cyan },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Target size={14} strokeWidth={1.5} style={{ color: T.accentL }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: T.t1, fontFamily: F.display }}>
            Insights
          </span>
        </div>
        <span style={{ fontSize: 11, color: T.t3, fontFamily: F.ui, display: 'block', paddingLeft: 22 }}>
          Performance analytique
        </span>
      </div>

      {/* Donut */}
      <div className="flex flex-col items-center" style={{ marginBottom: 22, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 160, height: 160,
          background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
        <svg width="112" height="112" viewBox="0 0 112 112" style={{ position: 'relative', zIndex: 1 }}>
          {slices.map((s, i) => {
            const dash = C * s.pct
            const o = off
            off += dash
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${dash - 3} ${C - dash + 3}`}
                strokeDashoffset={-o + C * 0.25}
                style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 4px ${s.color}40)` }} />
            )
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" fill={T.t1}
            fontSize="26" fontWeight="600" fontFamily={F.display}>67%</text>
          <text x={cx} y={cy + 13} textAnchor="middle" fill={T.t3}
            fontSize="10" fontFamily={F.ui}>succès</text>
        </svg>
        <div className="flex gap-4" style={{ marginTop: 12, position: 'relative', zIndex: 1 }}>
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
              <div style={{ width: 6, height: 6, borderRadius: 99, background: s.color, boxShadow: `0 0 6px ${s.color}50` }} />
              <span style={{ color: T.t2, fontFamily: F.ui }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T.t2, fontFamily: F.ui }}>{b.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.t1, fontFamily: F.display }}>{b.pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{
                height: 4, borderRadius: 99,
                background: `linear-gradient(90deg, ${b.color}, ${b.color}AA)`,
                width: `${b.pct}%`,
                transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                boxShadow: `0 0 8px ${b.color}25`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN — AI COMMAND CENTER
   ═══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const clock = useLiveClock()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleDelete = async (id: string) => {
    await api.delete(`/projects/${id}`)
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    setDeleteTarget(null)
  }

  const { data: projects = [], isLoading: pLoad } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => { const { data } = await api.get<Project[]>('/projects'); return data },
  })
  const { data: stats, isLoading: sLoad } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get<DashboardStats>('/dashboard/stats'); return data },
  })

  const s = stats ?? DEMO
  const active = projects.filter((p) => p.status === 'en_cours' || p.status === 'brouillon')
  const activeCount = useCountUp(active.length)
  const firstName = user?.name?.split(' ')[0] ?? 'vous'

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes centralPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.97; }
        }
        @keyframes statusGlow {
          0%, 100% { box-shadow: 0 0 4px rgba(52,211,153,0.4); }
          50%      { box-shadow: 0 0 10px rgba(52,211,153,0.7); }
        }
        .fu { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }

        .cmd-gradient-border { position: relative; }
        .cmd-gradient-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(59,130,246,0.15), transparent 50%, rgba(34,211,238,0.10));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        .cmd-central-pulse::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse at center, rgba(59,130,246,0.04) 0%, transparent 60%);
          animation: centralPulse 4s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* ── Ambient glow blobs ──────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '8%', width: 520, height: 520, borderRadius: '50%', background: 'rgba(59,130,246,0.04)', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', top: '25%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: 'rgba(34,211,238,0.025)', filter: 'blur(110px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '35%', width: 600, height: 600, borderRadius: '50%', background: 'rgba(59,130,246,0.03)', filter: 'blur(140px)' }} />
        <div style={{ position: 'absolute', top: '55%', left: '-4%', width: 350, height: 350, borderRadius: '50%', background: 'rgba(59,130,246,0.05)', filter: 'blur(90px)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', right: '15%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(34,211,238,0.02)', filter: 'blur(100px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {deleteTarget && (
          <DeleteConfirmModal
            title="Supprimer l'appel d'offres"
            message="Cette action est irréversible. Tous les documents, l'analyse IA, la checklist et le mémoire technique associés seront définitivement supprimés."
            projectName={deleteTarget.name}
            onConfirm={() => handleDelete(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {/* ── 2-column layout : left 2/3, right 1/3 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>

          {/* ════════════ LEFT COLUMN ════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── 1. MARKET CONTROL HEADER ─────────────── */}
            <div
              className="fu cmd-gradient-border"
              style={{
                ...card,
                padding: '24px 28px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: deepShadow,
                animationDelay: '0.04s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.brdH
                e.currentTarget.style.boxShadow = deepShadowHover
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.brd
                e.currentTarget.style.boxShadow = deepShadow
                e.currentTarget.style.transform = 'none'
              }}
            >
              {/* Inner radial glow */}
              <div style={{
                position: 'absolute', top: '40%', left: '25%',
                width: 350, height: 220,
                background: 'radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }} />

              <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* Brain icon hub */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(34,211,238,0.06))',
                    border: '1px solid rgba(59,130,246,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 24px rgba(59,130,246,0.10)',
                    flexShrink: 0,
                  }}>
                    <Brain size={24} strokeWidth={1.5} style={{ color: T.accentL }} />
                  </div>

                  <div>
                    <p style={{ fontSize: 12, fontWeight: 450, color: T.t3, fontFamily: F.ui, marginBottom: 4, letterSpacing: '0.01em' }}>
                      Bonjour, {firstName}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{
                        fontSize: 36, fontWeight: 600, fontFamily: F.display,
                        color: T.t1, letterSpacing: '-0.025em', lineHeight: 1,
                      }}>
                        {activeCount}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 450, color: T.t2, fontFamily: F.ui }}>
                        appels d&apos;offres actifs
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: T.t3, fontFamily: F.ui, marginTop: 6 }}>
                      {s.projects_en_cours} AO en cours · {s.documents_expirant_bientot} deadlines proches · {s.projects_soumis_ce_mois} soumis ce mois
                    </p>
                  </div>
                </div>

                {/* Right: AI status + clock */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '5px 14px', borderRadius: 99,
                    background: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.12)',
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: 99,
                      background: T.green,
                      animation: 'statusGlow 2.5s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.accentL, fontFamily: F.ui, letterSpacing: '0.02em' }}>
                      IA Opérationnelle
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12, color: T.t3, fontFamily: F.mono,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
                  }}>
                    {fmtDate(clock)} · {fmtTime(clock)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 2. AI ANALYSIS OVERVIEW (DOMINANT) ──── */}
            <div
              className="fu cmd-gradient-border cmd-central-pulse"
              style={{
                ...card,
                padding: 0,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: deepShadow,
                animationDelay: '0.10s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.brdH
                e.currentTarget.style.boxShadow = deepShadowHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.brd
                e.currentTarget.style.boxShadow = deepShadow
              }}
            >
              {/* Core radial glow */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 500, height: 280,
                background: 'radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 65%)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }} />

              {/* Header bar */}
              <div style={{
                position: 'relative', zIndex: 2,
                padding: '16px 24px',
                borderBottom: `1px solid ${T.brd}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <BarChart3 size={15} strokeWidth={1.5} style={{ color: T.accentL }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.t1, fontFamily: F.display }}>
                    Vue d&apos;ensemble
                  </span>
                  <span style={{ fontSize: 11, color: T.t3, fontFamily: F.ui, marginLeft: 4 }}>
                    Tableau de bord analytique
                  </span>
                </div>
                <span style={{
                  fontSize: 11, color: T.t3, fontFamily: F.mono,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  MàJ {fmtTime(clock)}
                </span>
              </div>

              {/* Stat metrics grid */}
              {sLoad ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', padding: 24, gap: 16 }}>
                  {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} className="h-[110px]" />)}
                </div>
              ) : (
                <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
                  {STATS.map((cfg, i) => (
                    <CompactStat
                      key={cfg.key}
                      cfg={cfg}
                      value={cfg.isAmount ? 842 : (s[cfg.key] ?? cfg.demo)}
                      delay={0.14 + i * 0.06}
                      isLast={i === STATS.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── 3. RECENT PROJECTS ──────────────────── */}
            <div className="fu" style={{ animationDelay: '0.38s' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <div className="flex items-center gap-2.5">
                  <FolderOpen size={15} strokeWidth={1.5} style={{ color: T.accentL }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.t1, fontFamily: F.display }}>
                    Projets récents
                  </span>
                  {active.length > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: T.accent,
                      background: T.accentBg, padding: '2px 8px', borderRadius: 99,
                      fontFamily: F.ui,
                    }}>
                      {active.length}
                    </span>
                  )}
                </div>
                {active.length > 0 && (
                  <button
                    onClick={() => navigate('/projects')}
                    className="flex items-center gap-1"
                    style={{
                      fontSize: 12, fontWeight: 450, color: T.t3, fontFamily: F.ui,
                      background: 'none', border: 'none', cursor: 'pointer',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.t1 }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.t3 }}
                  >
                    Voir tous <ArrowRight size={12} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {pLoad ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {[0, 1, 2].map((i) => <SkeletonCard key={i} className="h-[180px]" />)}
                </div>
              ) : active.length === 0 ? (
                <div
                  className="flex flex-col items-center text-center cmd-gradient-border"
                  style={{
                    ...card,
                    padding: '48px 24px',
                    borderStyle: 'dashed',
                    borderColor: 'rgba(59,130,246,0.08)',
                    boxShadow: deepShadow,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(34,211,238,0.06))',
                    border: '1px solid rgba(59,130,246,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                    boxShadow: '0 0 20px rgba(59,130,246,0.08)',
                  }}>
                    <Plus size={22} strokeWidth={1.5} style={{ color: T.accentL }} />
                  </div>
                  <p style={{ fontWeight: 600, color: T.t1, fontFamily: F.display, marginBottom: 4, fontSize: 15 }}>
                    Aucun appel d&apos;offres en cours
                  </p>
                  <p style={{ fontSize: 13, color: T.t3, fontFamily: F.ui, marginBottom: 20 }}>
                    Créez votre premier AO pour commencer l&apos;analyse IA
                  </p>
                  <button
                    onClick={() => navigate('/projects/new')}
                    className="flex items-center gap-2"
                    style={{
                      padding: '10px 22px', borderRadius: 10,
                      background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
                      color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: F.ui,
                      border: 'none', cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 6px 24px rgba(59,130,246,0.35)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.25)'
                      e.currentTarget.style.transform = 'none'
                    }}
                  >
                    <Plus size={14} strokeWidth={1.5} /> Créer mon premier AO
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {active.slice(0, 6).map((p, i) => (
                    <div key={p.id} className="fu" style={{ animationDelay: `${0.42 + i * 0.06}s` }}>
                      <AOCard project={p} onDelete={(id, name) => setDeleteTarget({ id, name })} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ════════════ RIGHT COLUMN (ACTION ZONE) ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Insights ────────────────────────────── */}
            <div
              className="fu cmd-gradient-border"
              style={{
                ...card,
                padding: '20px 22px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: deepShadow,
                animationDelay: '0.08s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.brdH
                e.currentTarget.style.boxShadow = deepShadowHover
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.brd
                e.currentTarget.style.boxShadow = deepShadow
                e.currentTarget.style.transform = 'none'
              }}
            >
              <InsightsPanel />
            </div>

            {/* ── Activity ────────────────────────────── */}
            <div
              className="fu"
              style={{
                ...card,
                padding: '20px 22px',
                boxShadow: deepShadow,
                animationDelay: '0.16s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.brdH
                e.currentTarget.style.boxShadow = deepShadowHover
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.brd
                e.currentTarget.style.boxShadow = deepShadow
                e.currentTarget.style.transform = 'none'
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
                letterSpacing: '0.06em', color: T.t3, fontFamily: F.ui,
                display: 'block', marginBottom: 14,
              }}>
                Activité récente
              </span>
              {ACTIVITY.map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3"
                  style={{
                    padding: '9px 8px',
                    borderRadius: 8,
                    borderBottom: i < ACTIVITY.length - 1 ? `1px solid ${T.brd}` : 'none',
                    cursor: 'default',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.03)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: 99, flexShrink: 0,
                    background: a.color, marginTop: 7,
                    boxShadow: `0 0 6px ${a.color}40`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 450, color: T.t1, fontFamily: F.ui, display: 'block' }}>
                      {a.label}
                    </span>
                    <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: T.t3, fontFamily: F.ui }}>{a.time}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 500, color: a.color,
                        background: a.bg, padding: '1px 8px',
                        borderRadius: 99, fontFamily: F.ui,
                        border: `1px solid ${a.color}18`,
                      }}>
                        {a.badge}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Quick Actions ────────────────────────── */}
            <div className="fu" style={{ animationDelay: '0.24s', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
                letterSpacing: '0.06em', color: T.t3, fontFamily: F.ui, marginBottom: 4,
              }}>
                Actions rapides
              </span>
              {[
                { icon: Plus,       label: "Nouvel appel d'offres", to: '/projects/new', color: T.accent },
                { icon: FolderOpen, label: 'Coffre-fort',           to: '/vault',         color: T.cyan },
                { icon: Clock,      label: 'Deadlines',             to: '/projects',      color: T.amber },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className="flex items-center gap-3 w-full text-left"
                  style={{
                    padding: '11px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${T.brd}`,
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = T.brdH
                    e.currentTarget.style.boxShadow = `0 0 16px ${a.color}10`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    e.currentTarget.style.borderColor = T.brd
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: `${a.color}10`,
                    border: `1px solid ${a.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <a.icon size={14} strokeWidth={1.5} style={{ color: a.color }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 450, color: T.t2, fontFamily: F.ui }}>{a.label}</span>
                  <ChevronRight size={13} strokeWidth={1.5} style={{ color: T.t3, marginLeft: 'auto', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   COMPACT STAT — AI Overview metric cell
   ═══════════════════════════════════════════════════════════════ */
function CompactStat({ cfg, value, delay, isLast = false }: {
  cfg: typeof STATS[number]; value: number; delay: number; isLast?: boolean
}) {
  const count = useCountUp(value)
  const display = cfg.isAmount ? `${count}k` : `${count}${cfg.suffix}`
  const TrendIcon = cfg.up ? ArrowUpRight : ArrowDownRight
  const trendColor = cfg.up ? T.green : T.red
  const Icon = cfg.icon

  return (
    <div
      className="fu"
      style={{
        padding: '22px 24px',
        borderRight: isLast ? 'none' : `1px solid ${T.brd}`,
        animationDelay: `${delay}s`,
        transition: 'background 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Icon badge */}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${cfg.dot}10`,
        border: `1px solid ${cfg.dot}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        boxShadow: `0 0 12px ${cfg.dot}08`,
      }}>
        <Icon size={16} strokeWidth={1.5} style={{ color: cfg.dot }} />
      </div>

      {/* Label */}
      <span style={{
        fontSize: 11, fontWeight: 500, textTransform: 'uppercase' as const,
        letterSpacing: '0.06em', color: T.t3, fontFamily: F.ui,
        display: 'block', marginBottom: 6,
      }}>
        {cfg.label}
      </span>

      {/* Number */}
      <div style={{
        fontSize: 28, fontWeight: 600, lineHeight: 1,
        letterSpacing: '-0.025em', color: T.t1, fontFamily: F.display,
        marginBottom: 10,
      }}>
        {display}
      </div>

      {/* Trend */}
      <div className="flex items-center gap-1">
        {cfg.trend !== '-' ? (
          <>
            <TrendIcon size={12} strokeWidth={2} style={{ color: trendColor }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: trendColor, fontFamily: F.ui }}>
              {cfg.trend}
            </span>
            <span style={{ fontSize: 10, color: T.t3, fontFamily: F.ui, marginLeft: 3 }}>
              vs mois dernier
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: T.t3, fontFamily: F.ui }}>
            —
          </span>
        )}
      </div>
    </div>
  )
}

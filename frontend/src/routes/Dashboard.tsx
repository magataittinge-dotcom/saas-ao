import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ArrowRight, ChevronRight, MoreHorizontal,
  BarChart3, ShieldCheck, Trophy, Send,
  FolderPlus, FileText, Users,
  Sparkles, CalendarDays, TrendingUp, AlertTriangle, Bot, MapPin,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import { SkeletonCard } from '@/components/common/Skeleton'
import { daysUntil } from '@/lib/utils'
import type { Project, DashboardStats } from '@/types'

const F = "'DM Sans', sans-serif"

/* ── Empty fallback ──────────────────────────────────────────── */
const EMPTY_STATS: DashboardStats = {
  projects_en_cours: 0,
  projects_soumis_ce_mois: 0,
  projects_gagnes: 0,
  taux_succes: 0,
  documents_expires: 0,
  documents_expirant_bientot: 0,
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

/* ── Format date ─────────────────────────────────────────────── */
function fmtDate(d: Date) {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).replace(/^\w/, (c) => c.toUpperCase())
}

/* ── Status config ───────────────────────────────────────────── */
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  brouillon: { label: 'Brouillon', color: '#64748B', bg: '#F1F5F9' },
  en_cours:  { label: 'En cours',  color: '#0EA5E9', bg: 'rgba(14,165,233,0.10)' },
  soumis:    { label: 'Soumis',    color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },
  gagné:     { label: 'Gagné',     color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
  perdu:     { label: 'Perdu',     color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
}

/* ── Stat cards config ───────────────────────────────────────── */
const STAT_CARDS: {
  key: keyof DashboardStats; label: string; icon: typeof BarChart3; suffix: string
  accent: string; iconBg: string
}[] = [
  { key: 'projects_en_cours',       label: 'AO en cours',      icon: BarChart3,   suffix: '', accent: '#0EA5E9', iconBg: 'rgba(14,165,233,0.08)' },
  { key: 'taux_succes',             label: 'Taux conformité',  icon: ShieldCheck, suffix: '%', accent: '#10B981', iconBg: 'rgba(16,185,129,0.08)' },
  { key: 'projects_gagnes',         label: 'AO gagnés',        icon: Trophy,      suffix: '', accent: '#3B82F6', iconBg: 'rgba(59,130,246,0.08)' },
  { key: 'projects_soumis_ce_mois', label: 'Soumis ce mois',   icon: Send,        suffix: '', accent: '#64748B', iconBg: 'rgba(100,116,139,0.08)' },
]

/* ── Quick actions config ────────────────────────────────────── */
const QUICK_ACTIONS = [
  { icon: FolderPlus, title: 'Nouveau dossier AO', desc: 'Scan nouveau DCE',    to: '/projects/new' },
  { icon: FileText,   title: 'Générer un mémoire', desc: 'À partir du template', to: '/projects' },
  { icon: Users,      title: "Gérer l'équipe",      desc: 'Workload',             to: '/settings' },
]

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
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

  const s = stats ?? EMPTY_STATS
  const active = projects.filter((p) => p.status === 'en_cours' || p.status === 'brouillon')
  const firstName = user?.name?.split(' ')[0] ?? 'vous'

  // Deadlines
  const upcoming = projects
    .filter((p) => p.deadline && (p.status === 'en_cours' || p.status === 'brouillon'))
    .map((p) => ({ ...p, _days: daysUntil(p.deadline!) }))
    .filter((p) => p._days >= -1)
    .sort((a, b) => a._days - b._days)
    .slice(0, 5)

  // AI score (based on real data)
  const aiScore = Math.min(
    Math.round(40 + (s.taux_succes * 0.3) + (s.projects_gagnes * 5) + (s.projects_soumis_ce_mois * 3)),
    100,
  )

  return (
    <div style={{ fontFamily: F }}>
      {deleteTarget && (
        <DeleteConfirmModal
          title="Supprimer cet appel d'offres ?"
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── GREETING SECTION ────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
              Bonjour, {firstName}
            </h1>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: '#059669', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.15)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              AI Active
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#64748B' }}>
              <CalendarDays size={14} style={{ color: '#94A3B8' }} />
              {fmtDate(new Date())}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#10B981' }}>
              <TrendingUp size={14} />
              +12% vs mois dernier
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors shrink-0"
          style={{ background: '#0F172A' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1E293B' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0F172A' }}
        >
          <Plus size={16} strokeWidth={2.5} /> Nouvel AO
        </button>
      </div>

      {/* ── 4 STAT CARDS ────────────────────────────────────── */}
      {sLoad ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} className="h-[110px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map((cfg) => (
            <StatCard
              key={cfg.key}
              icon={cfg.icon}
              label={cfg.label}
              value={s[cfg.key] ?? 0}
              suffix={cfg.suffix}
              accent={cfg.accent}
              iconBg={cfg.iconBg}
            />
          ))}
        </div>
      )}

      {/* ── 2-COLUMN LAYOUT ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">

        {/* ──── LEFT: Projets récents ────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold" style={{ color: '#0F172A' }}>Projets récents</h2>
              {active.length > 0 && (
                <span
                  className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                  style={{ color: '#0EA5E9', background: 'rgba(14,165,233,0.10)' }}
                >
                  {active.length}
                </span>
              )}
              <span className="text-xs hidden sm:inline" style={{ color: '#94A3B8' }}>
                Appels d&apos;offres actifs
              </span>
            </div>
            {active.length > 0 && (
              <button
                onClick={() => navigate('/projects')}
                className="text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ color: '#0EA5E9' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0284C7' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#0EA5E9' }}
              >
                Voir tout <ChevronRight size={14} />
              </button>
            )}
          </div>

          {pLoad ? (
            <div className="p-5 space-y-3">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} className="h-[52px]" />)}
            </div>
          ) : active.length === 0 ? (
            <div className="p-10 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ background: 'rgba(14,165,233,0.08)' }}
              >
                <Plus size={20} style={{ color: '#0EA5E9' }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>
                Aucun appel d&apos;offres en cours
              </p>
              <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
                Créez votre premier AO pour commencer l&apos;analyse IA
              </p>
              <button
                onClick={() => navigate('/projects/new')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
                style={{ background: '#0EA5E9' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0284C7' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0EA5E9' }}
              >
                <Plus size={14} /> Créer mon premier AO
              </button>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                className="hidden md:grid items-center gap-3 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  color: '#94A3B8',
                  borderBottom: '1px solid #F1F5F9',
                  gridTemplateColumns: '2fr 1fr 90px 140px 70px 32px',
                }}
              >
                <span>Projet & Client</span>
                <span>Lot</span>
                <span>Statut</span>
                <span>Progression</span>
                <span>Échéance</span>
                <span>Action</span>
              </div>

              {/* Table rows */}
              {active.slice(0, 8).map((p, i) => {
                const progress = ((p.current_step - 1) / 5) * 100
                const status = STATUS_MAP[p.status] ?? STATUS_MAP.brouillon
                const days = p.deadline ? daysUntil(p.deadline) : null
                const deadlineColor = days !== null && days <= 3
                  ? '#EF4444'
                  : days !== null && days <= 7
                    ? '#F59E0B'
                    : '#94A3B8'
                const progressColor = progress >= 80 ? '#10B981' : progress >= 40 ? '#0EA5E9' : '#F59E0B'

                return (
                  <div
                    key={p.id}
                    className="grid items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors"
                    style={{
                      borderBottom: i < Math.min(active.length, 8) - 1 ? '1px solid #F8FAFC' : 'none',
                      gridTemplateColumns: '2fr 1fr 90px 140px 70px 32px',
                    }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Project name + client */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{p.name}</p>
                      {p.maitre_ouvrage && (
                        <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: '#94A3B8' }}>
                          <MapPin size={10} className="shrink-0" />
                          {p.maitre_ouvrage}
                        </p>
                      )}
                    </div>

                    {/* Lot */}
                    <span className="text-xs truncate" style={{ color: '#64748B' }}>
                      {p.selected_lot_name ?? '—'}
                    </span>

                    {/* Status badge */}
                    <div>
                      <span
                        className="inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{ color: status.color, background: status.bg }}
                      >
                        {status.label}
                      </span>
                    </div>

                    {/* Progress bar + score */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#F1F5F9' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, background: progressColor }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums w-[32px] text-right" style={{ color: progressColor }}>
                        {Math.round(progress)}%
                      </span>
                    </div>

                    {/* Deadline */}
                    <span className="text-xs font-semibold whitespace-nowrap" style={{ color: deadlineColor }}>
                      {days !== null
                        ? days <= 0 ? "Auj." : `J-${days}`
                        : '—'}
                    </span>

                    {/* Action menu */}
                    <button
                      className="p-1 rounded-md transition-colors"
                      style={{ color: '#CBD5E1' }}
                      onClick={(e) => { e.stopPropagation() }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = '#F1F5F9' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                )
              })}
            </>
          )}

          {active.length > 8 && (
            <div className="px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: '#0EA5E9' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Voir les {active.length} projets <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* ──── RIGHT COLUMN ─────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* ── Actions rapides ───────────────────────────────── */}
          <div
            className="rounded-xl p-4"
            style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: '#0EA5E9' }} />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Actions rapides
              </h3>
            </div>
            {QUICK_ACTIONS.map((a, i) => (
              <button
                key={a.title}
                onClick={() => navigate(a.to)}
                className="flex items-center gap-3 w-full text-left py-3 px-2 transition-colors rounded-lg"
                style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#F1F5F9' }}
                >
                  <a.icon size={16} style={{ color: '#64748B' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{a.title}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{a.desc}</p>
                </div>
                <ChevronRight size={14} style={{ color: '#CBD5E1' }} className="shrink-0" />
              </button>
            ))}
          </div>

          {/* ── Deadlines proches ─────────────────────────────── */}
          <div
            className="rounded-xl p-4"
            style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} style={{ color: '#EF4444' }} />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Deadlines proches
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm py-3" style={{ color: '#CBD5E1' }}>Aucune deadline proche</p>
            ) : (
              <div className="space-y-0.5">
                {upcoming.map((p) => {
                  const dlDate = new Date(p.deadline!)
                  const day = dlDate.getDate()
                  const month = dlDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
                  const isUrgent = p._days <= 3
                  const isWarn = p._days <= 7

                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg transition-colors"
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFC' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {/* Date block */}
                      <div
                        className="text-center shrink-0 w-10 py-1 rounded-lg"
                        style={{ background: isUrgent ? 'rgba(239,68,68,0.06)' : '#F8FAFC' }}
                      >
                        <p className="text-sm font-bold leading-none" style={{ color: isUrgent ? '#EF4444' : '#0F172A' }}>{day}</p>
                        <p className="text-[10px] uppercase mt-0.5" style={{ color: '#94A3B8' }}>{month}</p>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{p.name}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>
                          {dlDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Badge */}
                      {isUrgent && (
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                          style={{ color: '#EF4444', background: 'rgba(239,68,68,0.10)' }}
                        >
                          Urgent
                        </span>
                      )}
                      {!isUrgent && isWarn && (
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                          style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.10)' }}
                        >
                          J-{p._days}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => navigate('/projects')}
              className="flex items-center gap-1 w-full justify-center mt-3 pt-3 text-xs font-medium transition-colors"
              style={{ color: '#0EA5E9', borderTop: '1px solid #F8FAFC' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#0284C7' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#0EA5E9' }}
            >
              Consulter le calendrier complet <ChevronRight size={12} />
            </button>
          </div>

          {/* ── Intelligence Synorix ──────────────────────────── */}
          <div
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.04), rgba(14,165,233,0.08))',
              border: '1px solid rgba(14,165,233,0.12)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Bot size={16} style={{ color: '#0EA5E9' }} />
              <h3 className="text-sm font-bold" style={{ color: '#0EA5E9' }}>
                Intelligence Synorix
              </h3>
            </div>
            <p className="text-[13px] italic leading-relaxed mb-4" style={{ color: '#475569' }}>
              {active.length > 0
                ? `Vous avez ${active.length} AO actif${active.length > 1 ? 's' : ''}. ${upcoming.length > 0 ? `Attention, ${upcoming.length} deadline${upcoming.length > 1 ? 's' : ''} proche${upcoming.length > 1 ? 's' : ''}.` : 'Aucune deadline urgente.'} Continuez sur votre lancée !`
                : "Créez votre premier appel d'offres pour que l'IA analyse votre dossier et optimise vos chances de succès."
              }
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Score d&apos;optimisation
              </span>
              <span className="text-lg font-bold" style={{ color: '#0EA5E9' }}>
                {aiScore}/100
              </span>
            </div>
            <div className="h-1.5 rounded-full mt-2" style={{ background: 'rgba(14,165,233,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${aiScore}%`, background: '#0EA5E9' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Stat Card ───────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, suffix, accent, iconBg }: {
  icon: typeof BarChart3; label: string; value: number; suffix: string
  accent: string; iconBg: string
}) {
  const count = useCountUp(value)
  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={20} style={{ color: accent }} />
        </div>
        {value > 0 && (
          <span
            className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ color: '#10B981', background: 'rgba(16,185,129,0.08)' }}
          >
            +{Math.min(value, 5)}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold mt-3" style={{ color: '#0F172A', fontFamily: F }}>
        {count}{suffix}
      </p>
      <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>{label}</p>
    </div>
  )
}

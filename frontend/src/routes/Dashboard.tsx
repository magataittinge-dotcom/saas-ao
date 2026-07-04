import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ChevronRight, ArrowRight, CalendarDays, MapPin, Sparkles,
  BarChart3, ShieldCheck, Trophy, Send, FolderX,
  FolderOpen, Building2, Award, FileStack, Archive, Calculator,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import QuotaGauge from '@/components/layout/QuotaGauge'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { api } from '@/services/api'
import { StatCard } from '@/components/dashboard/StatCard'
import { PipelineRail } from '@/components/dashboard/PipelineRail'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { StatCardGridSkeleton, ProjectListSkeleton } from '@/components/skeletons'
import { daysUntil } from '@/lib/utils'
import type { Project, DashboardStats } from '@/types'

/* ── Empty fallback ──────────────────────────────────────────────── */
const EMPTY_STATS: DashboardStats = {
  projects_en_cours: 0,
  projects_soumis_ce_mois: 0,
  projects_gagnes: 0,
  taux_succes: 0,
  documents_expires: 0,
  documents_expirant_bientot: 0,
}

/* ── Format date longue ──────────────────────────────────────────── */
function fmtDateLong(d: Date) {
  return d
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())
}

/* ── Accès rapide aux rubriques (routes réelles) ─────────────────── */
const RUBRIQUES: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: FolderOpen, label: 'Mes AO',            to: '/projects' },
  { icon: Building2,  label: 'Mon entreprise',    to: '/company' },
  { icon: Award,      label: 'Mes références',     to: '/references' },
  { icon: FileStack,  label: 'Profil mémoire',     to: '/company' },
  { icon: Archive,    label: 'Coffre-fort',        to: '/vault' },
  { icon: Calculator, label: 'Calculateurs',       to: '/outils' },
]

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, organization } = useAuthStore()

  const { data: projects = [], isLoading: pLoad } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => { const { data } = await api.get<Project[]>('/projects'); return data },
  })
  const { data: stats, isLoading: sLoad } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get<DashboardStats>('/dashboard/stats'); return data },
  })

  const queryClient = useQueryClient()
  const { mutate: markSansSuite } = useMutation({
    mutationFn: async (projectId: string) => {
      await api.patch(`/projects/${projectId}`, { status: 'sans_suite' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  // C15 — quota pour l'écran « premier DCE offert » + CTA upgrade sobre
  const { data: quotaStatus } = useQuery<{
    plan: string
    analyses: { used: number; limit: number | null }
    memoires: { used: number; limit: number | null }
  }>({
    queryKey: ['billing-quota'],
    queryFn: async () => { const { data } = await api.get('/billing/quota'); return data },
  })

  const s = stats ?? EMPTY_STATS
  const firstName = user?.name?.split(' ')[0] ?? 'vous'

  // B7 — deux zones : les AO clos (soumis/gagné/perdu/sans_suite) sortent des deux.
  const activeStatuses = new Set(['brouillon', 'en_cours', 'analyzed'])
  const activeProjects = projects.filter((p) => activeStatuses.has(p.status))
  // « En cours de réponse » : a dépassé l'analyse (candidature/mémoire entamés)
  // ou n'a pas encore atteint l'analyse (dossier en préparation).
  const enCoursReponse = activeProjects.filter(
    (p) => p.current_step >= 4 || p.status !== 'analyzed',
  )
  // « Analysés » : analyse terminée, aucune suite donnée pour l'instant.
  const analysesSansSuite = activeProjects.filter(
    (p) => p.status === 'analyzed' && p.current_step < 4,
  )
  const active = enCoursReponse

  // Piloter : uniquement les échéances sous 7 jours (AO actifs)
  const upcoming = activeProjects
    .filter((p) => p.deadline)
    .map((p) => ({ ...p, _days: daysUntil(p.deadline!) }))
    .filter((p) => p._days >= -1 && p._days < 7)
    .sort((a, b) => a._days - b._days)
    .slice(0, 4)

  // Cartes-stats — 100 % données réelles backend
  const statCards = [
    { icon: BarChart3,  label: 'AO en cours',     value: s.projects_en_cours },
    { icon: Send,       label: 'Soumis ce mois',  value: s.projects_soumis_ce_mois },
    { icon: Trophy,     label: 'AO gagnés',       value: s.projects_gagnes },
    { icon: ShieldCheck, label: 'Taux de réussite', value: s.taux_succes, suffix: '%', ring: s.taux_succes / 100 },
  ]

  // Note assistant — positive, basée sur les vrais compteurs
  const next = upcoming[0]
  const synorixNote = active.length === 0
    ? "Créez votre premier appel d'offres : l'IA analyse le DCE, prépare la candidature et rédige le mémoire technique."
    : `${active.length} appel${active.length > 1 ? 's' : ''} d'offres en cours.` +
      (next
        ? next._days <= 0
          ? ` Échéance du jour : « ${next.name} » — vous êtes dans les temps.`
          : ` Prochaine échéance dans ${next._days} jour${next._days > 1 ? 's' : ''} : « ${next.name} ».`
        : ' Aucune échéance imminente, vous avez de la marge.')

  // C15 — essai intact (free, trial accordé, 0 unité, 0 projet) → écran
  // central « premier DCE offert » ; essai consommé → dashboard normal.
  const freshTrial =
    organization?.plan === 'free'
    && organization?.trial_granted !== false
    && quotaStatus !== undefined
    && quotaStatus.analyses.used === 0
    && quotaStatus.memoires.used === 0
    && !pLoad && projects.length === 0

  if (freshTrial) {
    return <FirstAOWelcome />
  }

  const consumedFreeTrial =
    organization?.plan === 'free'
    && quotaStatus !== undefined
    && (quotaStatus.analyses.used > 0 || quotaStatus.memoires.used > 0
        || organization?.trial_granted === false)

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">

      {/* C15 — essai utilisé : CTA upgrade sobre, jamais bloquant */}
      {consumedFreeTrial && (
        <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-ds-text-2">
            Votre AO d'essai est utilisé. Le plan Pro couvre 40 analyses et 40 mémoires par mois.
          </p>
          <button
            onClick={() => navigate('/settings/billing')}
            className="shrink-0 text-sm font-medium text-ds-cyan hover:underline"
          >
            Voir les plans
          </button>
        </div>
      )}

      {/* ── EN-TÊTE ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-ds-text">Bonjour, {firstName}</h1>
            <span className="ai-badge">IA active</span>
          </div>
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-ds-text-2">
            <CalendarDays size={14} className="text-ds-text-3" />
            {fmtDateLong(new Date())}
          </span>
        </div>
        <button onClick={() => navigate('/projects/new')} className="signature-btn shrink-0 cursor-pointer">
          <Plus size={16} strokeWidth={2.5} /> Nouvel AO
        </button>
      </div>

      {/* ── CARTES STATS ─────────────────────────────────────────── */}
      {sLoad ? (
        <StatCardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((c, i) => (
            <StatCard
              key={c.label}
              icon={c.icon}
              label={c.label}
              value={c.value ?? 0}
              suffix={c.suffix}
              ring={c.ring}
              delay={i}
            />
          ))}
        </div>
      )}

      {/* ── 2 COLONNES ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

        {/* ─── GAUCHE : deux zones (B7) ────────────────────────────── */}
        <div className="space-y-5">
        <section className="glass-card overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-ds-border-subtle">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold text-ds-text">En cours de réponse</h2>
              {active.length > 0 && (
                <span className="pill pill-cyan text-[11px]">{active.length}</span>
              )}
            </div>
            {active.length > 0 && (
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center gap-1 text-xs font-medium text-ds-cyan hover:text-ds-cyan-dark transition-colors cursor-pointer"
              >
                Voir tout <ChevronRight size={14} />
              </button>
            )}
          </header>

          {pLoad ? (
            <ProjectListSkeleton count={3} />
          ) : active.length === 0 ? (
            <EmptyAO onCreate={() => navigate('/projects/new')} />
          ) : (
            <ul>
              {active.slice(0, 6).map((p, i) => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className={`w-full text-left px-5 py-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 items-center hover:bg-ds-bg-2 transition-colors cursor-pointer ${i > 0 ? 'border-t border-ds-bg-3' : ''}`}
                  >
                    {/* Projet + client */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ds-text truncate">{p.name}</p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-ds-text-3">
                        {p.maitre_ouvrage && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin size={10} className="shrink-0" />{p.maitre_ouvrage}
                          </span>
                        )}
                        {p.selected_lot_name && (
                          <span className="truncate text-ds-cyan-dark">{p.selected_lot_name}</span>
                        )}
                      </div>
                    </div>
                    {/* Échéance */}
                    <DeadlinePill deadline={p.deadline} emphasized={i === 0} />
                    {/* Rail pipeline (pleine largeur) */}
                    <div className="col-span-2">
                      <PipelineRail currentStep={p.current_step} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {active.length > 6 && (
            <div className="px-5 py-3 border-t border-ds-border-subtle">
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium text-ds-cyan hover:bg-ds-bg-2 transition-colors cursor-pointer"
              >
                Voir les {active.length} appels d'offres <ArrowRight size={14} />
              </button>
            </div>
          )}
        </section>

        {/* ── Zone « Analysés » : analyse faite, pas encore de suite ── */}
        {analysesSansSuite.length > 0 && (
          <section className="glass-card overflow-hidden">
            <header className="flex items-center gap-2.5 px-5 py-4 border-b border-ds-border-subtle">
              <h2 className="text-[15px] font-semibold text-ds-text">Analysés</h2>
              <span className="pill text-[11px]" style={{ background: '#F1F5F9', color: '#64748B' }}>
                {analysesSansSuite.length}
              </span>
              <span className="text-xs text-ds-text-3">analyse terminée, à vous de décider</span>
            </header>
            <ul>
              {analysesSansSuite.slice(0, 4).map((p, i) => (
                <li key={p.id}
                  className={`px-5 py-3.5 flex items-center gap-3 ${i > 0 ? 'border-t border-ds-bg-3' : ''}`}>
                  <button
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p className="text-sm font-semibold text-ds-text truncate">{p.name}</p>
                    {p.maitre_ouvrage && (
                      <p className="text-xs text-ds-text-3 truncate">{p.maitre_ouvrage}</p>
                    )}
                  </button>
                  <DeadlinePill deadline={p.deadline} />
                  <button
                    onClick={() => markSansSuite(p.id)}
                    title="Classer cet AO « Analysé — sans suite » : décision prise, il quitte le tableau de bord"
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ds-text-2 hover:bg-ds-bg-2 transition-colors cursor-pointer"
                    style={{ border: '1px solid #E2E8F0' }}
                  >
                    <FolderX size={13} /> Sans suite
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        {/* ─── DROITE ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Zone Piloter : jauge quota + échéances < 7 jours (B7) */}
          <section className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={14} className="text-ds-cyan" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ds-text-3">Piloter</h3>
            </div>
            <div className="-mx-4 mb-2">
              <QuotaGauge />
            </div>
            {/* C14 — taux de réussite (gagnés / décidés) */}
            {(s.projects_gagnes > 0 || s.taux_succes > 0) && (
              <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-xs">
                <span className="text-ds-text-3">Taux de réussite</span>
                <span className="font-semibold text-ds-text">{s.taux_succes} %</span>
              </div>
            )}
            {upcoming.length === 0 ? (
              <p className="text-sm text-ds-text-3 py-2">Aucune échéance sous 7 jours.</p>
            ) : (
              <ul className="space-y-0.5">
                {upcoming.map((p, i) => {
                  const d = new Date(p.deadline!)
                  const day = d.getDate()
                  const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
                  const near = i === 0
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className="flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg hover:bg-ds-bg-2 transition-colors cursor-pointer"
                      >
                        <div
                          className={`text-center shrink-0 w-11 py-1 rounded-lg ${near ? 'bg-ds-cyan/10 shadow-glow-sm' : 'bg-ds-bg-2'}`}
                        >
                          <p className={`text-sm font-bold leading-none ${near ? 'text-ds-cyan-dark' : 'text-ds-text'}`}>{day}</p>
                          <p className="text-[10px] uppercase mt-0.5 text-ds-text-3">{month}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ds-text truncate">{p.name}</p>
                          <p className="text-xs text-ds-text-3">
                            {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <DeadlinePill deadline={p.deadline} emphasized={near} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Accès rapide aux rubriques */}
          <section className="glass-card p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ds-text-3 mb-3">Accès rapide</h3>
            <div className="grid grid-cols-3 gap-2">
              {RUBRIQUES.map((r) => (
                <button
                  key={r.to}
                  onClick={() => navigate(r.to)}
                  className="group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border border-ds-border-subtle hover:border-ds-cyan/40 hover:bg-ds-bg-2 transition-all cursor-pointer"
                >
                  <span className="stat-icon-bg !h-9 !w-9 bg-ds-bg-2 group-hover:bg-ds-cyan/10 transition-colors">
                    <r.icon size={16} className="text-ds-text-2 group-hover:text-ds-cyan transition-colors" />
                  </span>
                  <span className="text-[11px] font-medium text-ds-text-2 text-center leading-tight">{r.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Note Synorix — positive, premium silencieux */}
          <section className="glass-card p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.04), rgba(14,165,233,0.08))' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} className="text-ds-cyan" />
              <h3 className="text-sm font-bold text-ds-cyan-dark">Synorix</h3>
            </div>
            <p className="text-[13px] leading-relaxed text-ds-text-1b">{synorixNote}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

/* ── État vide AO ────────────────────────────────────────────────── */
function EmptyAO({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-10 text-center">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-ds-cyan/10">
        <Plus size={20} className="text-ds-cyan" />
      </div>
      <p className="text-sm font-semibold text-ds-text mb-1">Aucun appel d'offres en cours</p>
      <p className="text-xs text-ds-text-3 mb-5">Lancez votre premier AO pour démarrer l'analyse IA du DCE.</p>
      <button onClick={onCreate} className="btn-primary inline-flex items-center gap-2 cursor-pointer">
        <Plus size={14} /> Créer mon premier AO
      </button>
    </div>
  )
}

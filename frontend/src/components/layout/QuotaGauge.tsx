import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { nomPlan } from '@/lib/offres'
import { cn } from '@/lib/utils'

interface QuotaCounter {
  used: number
  limit: number | null
}

interface QuotaStatus {
  plan: string
  period_start: string | null
  period_end: string | null
  analyses: QuotaCounter
  memoires: QuotaCounter
}

/** Jauge : bleu de Prusse, ambre à 80 %, brique quand le quota bloque. */
function teinte(used: number, limit: number): { texte: string; barre: string } {
  if (used >= limit) return { texte: 'text-bloquant', barre: 'bg-bloquant' }
  if (used / limit >= 0.8) return { texte: 'text-attention', barre: 'bg-attention' }
  return { texte: 'text-encre-2', barre: 'bg-prusse-500' }
}

function CounterRow({ label, counter }: { label: string; counter: QuotaCounter }) {
  if (counter.limit === null) return null
  const t = teinte(counter.used, counter.limit)
  const pct = Math.min(100, (counter.used / counter.limit) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px] text-encre-2">
        <span>{label}</span>
        <span className={cn('tabular-nums', t.texte)}>{counter.used} / {counter.limit}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-[width] duration-300', t.barre)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Quota mensuel (mis en cache partagé entre la jauge et la barre d'icônes). */
export function useQuota() {
  return useQuery<QuotaStatus>({
    queryKey: ['billing-quota'],
    queryFn: async () => {
      const { data } = await api.get<QuotaStatus>('/billing/quota')
      return data
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

/** Part du quota la plus entamée (0 à 1), null si l'offre est illimitée. */
export function partQuota(q: QuotaStatus | undefined): number | null {
  if (!q?.analyses || !q.memoires) return null
  const parts = [q.analyses, q.memoires].filter((c) => c.limit !== null).map((c) => c.used / (c.limit as number))
  return parts.length ? Math.min(1, Math.max(...parts)) : null
}

/** Anneau de quota pour la barre d'icônes : un clic mène à Paramètres › Abonnement. */
export function QuotaRond() {
  const { data } = useQuota()
  const part = partQuota(data)
  if (!data?.analyses || !data.memoires) return null
  const R = 15
  const C = 2 * Math.PI * R
  const bloque = part !== null && part >= 1
  const proche = part !== null && part >= 0.8
  const detail = part === null
    ? `Offre ${nomPlan(data.plan)} · illimitée`
    : `Analyses ${data.analyses.used} / ${data.analyses.limit} · Mémoires ${data.memoires.used} / ${data.memoires.limit}`
  return (
    <Link to="/settings/billing" aria-label={`Abonnement et quota. ${detail}`} title={detail}
      className="relative grid size-11 place-items-center rounded-pilule text-fg-2 transition-colors duration-base hover:bg-surface-2 hover:text-fg">
      <svg viewBox="0 0 36 36" className="size-8 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3" className="stroke-bord-2" />
        {part !== null && (
          <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - part)}
            className={cn('transition-[stroke-dashoffset] duration-morph ease-expo', bloque ? 'stroke-danger' : proche ? 'stroke-warning' : 'stroke-accent-ui')} />
        )}
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums text-fg-2">{part === null ? '∞' : `${Math.round(part * 100)}`}</span>
    </Link>
  )
}

/**
 * Offre et quota mensuel (C17), en pied de barre latérale ; un clic mène à
 * Paramètres › Abonnement. Business (illimité) n'affiche que son offre.
 */
export default function QuotaGauge() {
  const { data } = useQuota()

  if (!data?.analyses || !data.memoires) return null
  const essai = data.plan === 'free'
  const illimite = data.analyses.limit === null && data.memoires.limit === null

  return (
    <Link
      to="/settings/billing"
      title="Voir mon abonnement"
      className="block space-y-2 rounded-md px-1.5 py-2.5 transition-colors hover:bg-surface-2"
    >
      {!illimite && (
        <>
          <CounterRow label="Analyses" counter={data.analyses} />
          <CounterRow label="Mémoires" counter={data.memoires} />
        </>
      )}
      <p className="text-xs text-encre-3">
        {essai ? 'Essai gratuit' : `Offre ${nomPlan(data.plan)}`}
        {illimite && ' · illimitée'}
        {essai && <span className="text-prusse-700"> · Choisir une offre</span>}
      </p>
    </Link>
  )
}

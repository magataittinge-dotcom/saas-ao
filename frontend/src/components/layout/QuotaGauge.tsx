import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

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

function gaugeColor(used: number, limit: number): string {
  if (used >= limit) return '#EF4444'
  if (used / limit >= 0.8) return '#F59E0B'
  return '#0EA5E9'
}

function CounterRow({ label, counter }: { label: string; counter: QuotaCounter }) {
  if (counter.limit === null) return null
  const color = gaugeColor(counter.used, counter.limit)
  const pct = Math.min(100, (counter.used / counter.limit) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-14 shrink-0" style={{ color: '#94A3B8' }}>{label}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color }}>
        {counter.used}/{counter.limit}
      </span>
    </div>
  )
}

/**
 * Jauge de quota mensuel (C17) — affichée dans la sidebar, cliquable vers
 * la page Facturation. Business (illimité) n'affiche pas de jauge.
 */
export default function QuotaGauge() {
  const navigate = useNavigate()
  const { data } = useQuery<QuotaStatus>({
    queryKey: ['billing-quota'],
    queryFn: async () => {
      const { data } = await api.get<QuotaStatus>('/billing/quota')
      return data
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  if (!data) return null
  if (data.analyses.limit === null && data.memoires.limit === null) return null // illimité

  return (
    <button
      onClick={() => navigate('/settings/billing')}
      title="Voir mon abonnement"
      className="w-full text-left px-4 py-2 space-y-1.5 transition-colors hover:bg-[#F1F5F9]"
      style={{ borderTop: '1px solid #E2E8F0' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>
        {data.plan === 'free' ? 'Essai gratuit' : 'Quota mensuel'}
      </span>
      <CounterRow label="Analyses" counter={data.analyses} />
      <CounterRow label="Mémoires" counter={data.memoires} />
    </button>
  )
}

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
  if (used >= limit) return '#F87171'
  if (used / limit >= 0.8) return '#FBBF24'
  return '#22D3EE'
}

function CounterRow({ label, counter }: { label: string; counter: QuotaCounter }) {
  if (counter.limit === null) return null
  const color = gaugeColor(counter.used, counter.limit)
  const pct = Math.min(100, (counter.used / counter.limit) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-14 shrink-0" style={{ color: '#6B7280' }}>{label}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#232730' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="edge-data text-[10px] font-semibold tabular-nums shrink-0" style={{ color }}>
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
      className="w-full text-left px-4 py-2 space-y-1.5 transition-colors hover:bg-[#232730]"
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#6B7280' }}>
        {data.plan === 'free' ? 'Essai gratuit' : 'Quota mensuel'}
      </span>
      <CounterRow label="Analyses" counter={data.analyses} />
      <CounterRow label="Mémoires" counter={data.memoires} />
    </button>
  )
}

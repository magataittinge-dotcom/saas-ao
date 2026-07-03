import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Check } from 'lucide-react'
import { api } from '@/services/api'

interface PlanningStep {
  id: string
  label: string
  date: string
  heure: string | null
  note: string | null
  passed: boolean
}

interface Props {
  projectId: string
}

function formatFr(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * C20 — rétro-planning auto : timeline verticale sobre dérivée des dates
 * du DCE (visite obligatoire → questions → dépôt recommandé J−1 → deadline).
 * Aucune date inventée : une étape sans date n'apparaît pas.
 */
export default function RetroPlanning({ projectId }: Props) {
  const { data } = useQuery<{ lot: string | null; steps: PlanningStep[] }>({
    queryKey: ['retroplanning', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/retroplanning`)
      return data
    },
    staleTime: 60_000,
  })

  if (!data || data.steps.length === 0) return null

  return (
    <div className="rounded-lg px-5 py-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} style={{ color: '#0EA5E9' }} />
        <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Rétro-planning</h3>
      </div>
      <ol className="relative ml-2">
        {data.steps.map((step, i) => (
          <li key={step.id} className="relative pl-6 pb-4 last:pb-0">
            {i < data.steps.length - 1 && (
              <span className="absolute left-[5px] top-4 bottom-0 w-px" style={{ background: '#E2E8F0' }} />
            )}
            <span
              className="absolute left-0 top-1 w-[11px] h-[11px] rounded-full flex items-center justify-center"
              style={step.passed
                ? { background: '#E2E8F0' }
                : step.id === 'deadline'
                  ? { background: '#0F172A' }
                  : { background: '#0EA5E9' }}
            >
              {step.passed && <Check size={8} style={{ color: '#64748B' }} />}
            </span>
            <p className="text-sm font-medium leading-tight"
              style={{ color: step.passed ? '#94A3B8' : '#0F172A', textDecoration: step.passed ? 'line-through' : undefined }}>
              {step.label}
            </p>
            <p className="text-xs mt-0.5" style={{ color: step.passed ? '#CBD5E1' : '#64748B' }}>
              {formatFr(step.date)}{step.heure && ` à ${step.heure}`}
              {step.passed && ' — passée'}
            </p>
            {step.note && !step.passed && (
              <p className="text-[11px] italic mt-0.5" style={{ color: '#94A3B8' }}>{step.note}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

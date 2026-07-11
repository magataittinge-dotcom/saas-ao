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
    <div className="rounded-lg px-5 py-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} style={{ color: '#22D3EE' }} />
        <h3 className="text-sm font-bold" style={{ color: '#E7EAEE' }}>Rétro-planning</h3>
      </div>
      <ol className="relative ml-2">
        {data.steps.map((step, i) => (
          <li key={step.id} className="relative pl-6 pb-4 last:pb-0">
            {i < data.steps.length - 1 && (
              <span className="absolute left-[5px] top-4 bottom-0 w-px" style={{ background: '#232730' }} />
            )}
            <span
              className="absolute left-0 top-1 w-[11px] h-[11px] rounded-full flex items-center justify-center"
              style={step.passed
                ? { background: '#232730' }
                : step.id === 'deadline'
                  ? { background: '#E7EAEE' }
                  : { background: '#22D3EE' }}
            >
              {step.passed && <Check size={8} style={{ color: '#9AA3AE' }} />}
            </span>
            <p className="text-sm font-medium leading-tight"
              style={{ color: step.passed ? '#6B7280' : '#E7EAEE', textDecoration: step.passed ? 'line-through' : undefined }}>
              {step.label}
            </p>
            <p className="text-xs mt-0.5" style={{ color: step.passed ? '#4B5563' : '#9AA3AE' }}>
              {formatFr(step.date)}{step.heure && ` à ${step.heure}`}
              {step.passed && ' — passée'}
            </p>
            {step.note && !step.passed && (
              <p className="text-[11px] italic mt-0.5" style={{ color: '#6B7280' }}>{step.note}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

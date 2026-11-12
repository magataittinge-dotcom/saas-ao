import { heureLisible } from '@/lib/carteAO'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Sigle } from '@/components/common/Sigle'
import { Carte, TitreCarte } from '@/components/ui/carte'
import { cn } from '@/lib/utils'
import { lireDate } from '@/lib/dateParis'
import { jourSemaineParis } from '@/lib/remiseParis'
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

/** « vendredi 20 novembre », à l'heure de Paris (Q-08) : le serveur envoie le jour seul (AAAA-MM-JJ). */
function formatFr(iso: string): string {
  const d = lireDate(iso)
  return d ? jourSemaineParis(d) : iso
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
    <Carte className="grid min-w-0 content-start gap-4">
      <header className="grid gap-1">
        <TitreCarte>Rétro-planning</TitreCarte>
        <p className="text-sm text-fg-2">Les dates lues dans le <Sigle code="RC" />, dans l’ordre.</p>
      </header>
      <ol className="grid">
        {data.steps.map((step, i) => (
          <li key={step.id} className="relative grid gap-0.5 pb-4 pl-7 last:pb-0">
            {i < data.steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-2 top-5 w-px bg-bord-2" />}
            <span aria-hidden className={cn('absolute left-0 top-0.5 grid size-4 place-items-center rounded-pilule border',
              step.passed ? 'border-bord-2 bg-surface-1 text-fg-3' : step.id === 'deadline' ? 'border-accent-ui bg-accent-ui' : 'border-accent-ui bg-surface-0')}>
              {step.passed && <Check size={10} strokeWidth={2.5} />}
            </span>
            <p className={cn('text-sm font-medium', step.passed ? 'text-fg-3' : 'text-fg')}>{step.label}</p>
            <p className={cn('text-sm', step.passed ? 'text-fg-3' : 'text-fg-2')}>
              {formatFr(step.date)}{step.heure && ` à ${heureLisible(step.heure)}`}
              {step.passed && ' (passée)'}
            </p>
            {step.note && !step.passed && <p className="text-xs text-fg-3">{step.note}</p>}
          </li>
        ))}
      </ol>
    </Carte>
  )
}

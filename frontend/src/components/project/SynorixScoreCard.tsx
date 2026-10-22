import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, CircleDot, ExternalLink } from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'
import type { FieldSource } from './CriticalBanner'

interface Composante {
  id: string
  label: string
  statut: 'ok' | 'warning' | 'ko' | 'non_evaluable'
  explication: string
  source: FieldSource | null
  action: 'completer_profil' | null
}

interface ScorePayload {
  composantes: Composante[]
}

/** Conditions lues dans le profil de l'entreprise (les autres viennent du DCE). */
const CONDITIONS_DE_PROFIL = new Set(['ca', 'qualifications'])

/** Libellés calmes (1.7) : jamais de verdict alarmant, la décision reste au patron. */
export function libelleStatut(c: Pick<Composante, 'id' | 'statut'>): string {
  if (c.statut === 'ok') return CONDITIONS_DE_PROFIL.has(c.id) ? 'Correspond à votre profil' : 'Relevé dans le DCE'
  return 'À confirmer par vous'
}

interface Props {
  project: Project
  onOpenSource: (source: FieldSource) => void
  /** « On y va » : l'analyse est validée, l'AO passe à la vérification. */
  onYAller: () => void
  enCours?: boolean
}

/**
 * 1.7 — Fiche de décision en fin d'analyse : les conditions vérifiées (DCE ×
 * profil), chacune avec sa source, puis « On y va » / « On passe ». Calcul
 * déterministe côté serveur (synorix_score.py), sans score ni verdict affichés,
 * sans aucun critère de prix.
 */
export default function SynorixScoreCard({ project, onOpenSource, onYAller, enCours }: Props) {
  const queryClient = useQueryClient()
  const { data } = useQuery<ScorePayload>({
    queryKey: ['synorix-score', project.id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/synorix-score`)
      return data
    },
    staleTime: 60_000,
  })

  const { mutate: changerStatut, isPending: changement } = useMutation({
    mutationFn: async (status: 'sans_suite' | 'analyzed') => {
      await api.patch(`/projects/${project.id}`, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  if (!data || data.composantes.length === 0) return null
  const decideAller = project.completed_steps?.['3'] === true
  const decidePasser = project.status === 'sans_suite'

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="fiche-decision-titre">
      <header className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <p className="microlabel">Décision</p>
        <h2 id="fiche-decision-titre" className="mt-1 text-base font-semibold" style={{ color: '#F7F8F8' }}>
          On y va ?
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: '#959597' }}>
          Les conditions relevées dans le DCE, comparées à votre profil. La décision vous appartient.
        </p>
      </header>

      <ul>
        {data.composantes.map((comp, i) => (
          <li
            key={comp.id}
            className="px-5 py-2.5 flex items-start gap-3"
            style={i < data.composantes.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,.07)' } : undefined}
          >
            <span className="mt-0.5 shrink-0">
              {comp.statut === 'ok'
                ? <Check size={14} style={{ color: '#6EE7A8' }} />
                : <CircleDot size={14} style={{ color: '#D9A441' }} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs">
                <span className="font-semibold" style={{ color: '#D8D9DB' }}>{comp.label}</span>
                <span style={{ color: comp.statut === 'ok' ? '#6EE7A8' : '#D9A441' }}> · {libelleStatut(comp)}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#959597' }}>
                {comp.explication}
                {comp.action === 'completer_profil' && (
                  <>
                    {' '}
                    <Link to="/company" className="font-medium underline" style={{ color: '#E8E9EB' }}>
                      Compléter mon profil
                    </Link>
                  </>
                )}
              </p>
            </div>
            {comp.source && (
              <button
                onClick={() => onOpenSource(comp.source!)}
                title={`Source — ${comp.source.document}`}
                aria-label={`Voir la source : ${comp.source.document}`}
                className="shrink-0 p-1 rounded"
                style={{ color: '#959597' }}
              >
                <ExternalLink size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <footer className="px-5 py-3.5 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
        {decidePasser ? (
          <>
            <p className="text-sm flex-1" style={{ color: '#D8D9DB' }}>Vous avez classé cet AO sans suite.</p>
            <button
              onClick={() => changerStatut('analyzed')}
              disabled={changement}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
              style={{ color: '#F7F8F8', border: '1px solid rgba(255,255,255,.14)' }}
            >
              Rouvrir l'AO
            </button>
          </>
        ) : decideAller ? (
          <p className="text-sm" style={{ color: '#D8D9DB' }}>Vous avez décidé d'y aller.</p>
        ) : (
          <>
            <button onClick={onYAller} disabled={enCours || changement} className="signature-btn disabled:opacity-60">
              On y va
            </button>
            <button
              onClick={() => changerStatut('sans_suite')}
              disabled={enCours || changement}
              className="glass-btn px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ color: '#C2C3C6' }}
            >
              On passe
            </button>
            <p className="text-xs" style={{ color: '#959597' }}>
              « On passe » classe l'AO sans suite ; vous pourrez le rouvrir.
            </p>
          </>
        )}
      </footer>
    </section>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sigle } from '@/components/common/Sigle'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import type { Project } from '@/types'
import type { FieldSource } from './CriticalBanner'
import { voirTresorerie } from './TresorerieCard'
import { Bouton } from '@/components/ui/bouton'
import { Carte, TitreCarte } from '@/components/ui/carte'
import { EtatElement } from '@/components/etape'
import { libelleSource } from '@/lib/resumeAO'

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

const PENALITES = 'penalites'

/** Conditions lues dans le profil de l'entreprise (les autres viennent du DCE). */
const CONDITIONS_DE_PROFIL = new Set(['ca', 'qualifications'])

/** Libellés calmes (1.7) : jamais de verdict alarmant, la décision reste au patron. */
export function libelleStatut(c: Pick<Composante, 'id' | 'statut'>): string {
  if (c.statut === 'ok') return CONDITIONS_DE_PROFIL.has(c.id) ? 'Correspond à votre profil' : 'Relevé dans le dossier'
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
    <Carte sansMarge aria-labelledby="fiche-decision-titre" role="group">
      <header className="grid gap-1 border-b border-bord px-5 py-4 sm:px-6">
        <TitreCarte id="fiche-decision-titre">On y va ?</TitreCarte>
        <p className="text-sm text-fg-2">
          Les conditions relevées dans le <Sigle code="DCE" />, comparées à votre profil. La décision vous appartient.
        </p>
      </header>

      <ul>
        {data.composantes.map((comp) => {
          const source = comp.source && comp.id !== PENALITES ? comp.source : null
          return (
            <li key={comp.id} className="grid gap-1 border-b border-bord px-5 py-3 sm:px-6">
              <p className="text-sm font-semibold text-fg">{comp.label}</p>
              {comp.id === PENALITES ? (
                // V3 — le détail des pénalités n'est dit qu'une fois, dans « Trésorerie du marché » : ici, un lien seulement.
                (comp.source || comp.statut !== 'ok') && (
                  <p><Bouton variante="lien" onClick={voirTresorerie}>Voir les pénalités</Bouton></p>
                )
              ) : (
                <p className="break-words text-sm text-fg-2">
                  {comp.explication}
                  {comp.action === 'completer_profil' && (
                    <>
                      {' '}
                      <Bouton asChild variante="lien"><Link to="/company">Compléter mon profil</Link></Bouton>
                    </>
                  )}
                </p>
              )}
              <EtatElement
                etat={comp.statut === 'ok' ? 'pret' : 'a-verifier'}
                texte={libelleStatut(comp)}
                source={source ? { libelle: libelleSource(source) ?? source.document, onVoir: () => onOpenSource(source) } : undefined}
              />
            </li>
          )
        })}
      </ul>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
        {decidePasser ? (
          <>
            <p className="min-w-0 flex-1 basis-56 text-sm text-fg-2">Vous avez classé cet appel d’offres sans suite.</p>
            <Bouton variante="secondaire" onClick={() => changerStatut('analyzed')} enCours={changement} libelleEnCours="Réouverture…">Rouvrir l’appel d’offres</Bouton>
          </>
        ) : decideAller ? (
          <p className="text-sm text-fg-2">Vous avez décidé d’y aller.</p>
        ) : (
          <>
            {/* « On y va » est l'action principale de l'en-tête (un seul aplat par écran) ; ici, au trait, là où la décision se lit */}
            <Bouton variante="secondaire" onClick={onYAller} disabled={enCours || changement}>On y va</Bouton>
            <Bouton variante="secondaire" onClick={() => changerStatut('sans_suite')} disabled={enCours || changement}>On passe</Bouton>
            <p className="min-w-0 flex-1 basis-56 text-sm text-fg-3">« On passe » classe l’appel d’offres sans suite ; vous pourrez le rouvrir.</p>
          </>
        )}
      </footer>
    </Carte>
  )
}

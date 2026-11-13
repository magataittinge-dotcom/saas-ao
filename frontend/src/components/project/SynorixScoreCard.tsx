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
import { CheckCircle2 } from 'lucide-react'

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
  /** Téléphone : « On y va » est porté par la barre du bas (au pouce) ; la carte ne le redit pas. */
  allerDansLaBarre?: boolean
}

/**
 * 1.7 — Fiche de décision en fin d'analyse : les conditions vérifiées (DCE ×
 * profil), chacune avec sa source, puis « On y va » / « On passe ». Calcul
 * déterministe côté serveur (synorix_score.py), sans score ni verdict affichés,
 * sans aucun critère de prix.
 */
export default function SynorixScoreCard({ project, onOpenSource, onYAller, enCours, allerDansLaBarre }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<ScorePayload>({
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

  // La décision se prend ici : la carte reste, même sans condition relevée (la lecture des conditions a pu échouer).
  if (isLoading) return null
  const composantes = data?.composantes ?? []
  const decideAller = project.completed_steps?.['3'] === true
  const decidePasser = project.status === 'sans_suite'

  return (
    <Carte sansMarge aria-labelledby="fiche-decision-titre" role="group">
      <header className="grid gap-1 border-b border-bord px-5 py-4 sm:px-6">
        <TitreCarte id="fiche-decision-titre">On y va ?</TitreCarte>
        <p className="text-sm text-fg-2">
          Les conditions relevées dans le <Sigle code="DCE" />, comparées à votre profil. La décision vous appartient.
        </p>
      </header>

      <ul>
        {composantes.map((comp) => {
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
              {/* Seule l'exception est marquée (« À confirmer par vous », en ambre) ; une condition relevée se lit en texte neutre. */}
              {comp.statut === 'ok' ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
                  <span>{libelleStatut(comp)}</span>
                  {source && <span>Source : {libelleSource(source) ?? source.document}</span>}
                  {source && <Bouton variante="lien" onClick={() => onOpenSource(source)}>Voir dans le dossier</Bouton>}
                </p>
              ) : (
                <EtatElement
                  etat="a-verifier"
                  texte={libelleStatut(comp)}
                  source={source ? { libelle: libelleSource(source) ?? source.document, onVoir: () => onOpenSource(source) } : undefined}
                />
              )}
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
          // La décision prise se lit comme un état (une icône, une phrase à l'encre), plus comme une note grise ; on peut encore
          // classer l'appel d'offres sans suite (réversible).
          <>
            <p data-decision="aller" className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-base font-semibold text-fg">
              <CheckCircle2 aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-vert-ink" />
              Vous avez décidé d’y aller
            </p>
            <Bouton variante="lien" onClick={() => changerStatut('sans_suite')} enCours={changement} libelleEnCours="Classement…">Classer sans suite</Bouton>
          </>
        ) : (
          // La décision se prend ici, une fois (jury, tour 3 : « On y va » en tête, dans la carte et dans la barre) : l'aplat de
          // l'écran et « On passe » à côté. Au téléphone, la barre du bas porte « On y va » ; la carte garde « On passe ».
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {!allerDansLaBarre && <Bouton variante="principal" onClick={onYAller} enCours={enCours} libelleEnCours="Validation…" disabled={changement}>On y va</Bouton>}
            <Bouton variante="secondaire" onClick={() => changerStatut('sans_suite')} disabled={enCours || changement}>On passe</Bouton>
            <p className="min-w-0 flex-1 basis-64 text-sm text-fg-2">La préparation des pièces s’ouvre ensuite. Un appel d’offres classé sans suite peut être rouvert.</p>
          </div>
        )}
      </footer>
    </Carte>
  )
}

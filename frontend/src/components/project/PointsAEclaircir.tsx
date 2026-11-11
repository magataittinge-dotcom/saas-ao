import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Clock, Copy } from 'lucide-react'
import { api } from '@/services/api'
import { SectionEtape } from '@/components/etape'
import { sansJargonIA } from '@/lib/analyseLibelles'
import EchecAction from '@/components/common/EchecAction'
import { Bouton } from '@/components/ui/bouton'
import { messageErreur } from '@/lib/erreurs'
import { copierTexte } from '@/lib/copier'
import { etatEcheance } from '@/lib/echeance'
import { libelleSource, libelleDateQuestions, texteACopier, type DateQuestions } from '@/lib/resumeAO'
import type { SourceFait } from '@/lib/carteAO'
import type { PointAEclaircir, Project } from '@/types'

const MESSAGE_PREPARATION = "Les questions n’ont pas pu être préparées. Réessayez dans un instant."

/** Ce que dit la proximité de la date limite des questions (COULEURS.md) : rouge à 3 jours ou moins, ambre de 4 à 7 jours ; rien au-delà. */
export function urgenceQuestions(date: DateQuestions | null | undefined, maintenant: Date = new Date()): { ton: 'rouge' | 'ambre'; texte: string } | null {
  if (!date || date.statut !== 'trouvee' || !date.date || date.regle === 'reponse_acheteur') return null
  const e = etatEcheance({ date: date.date, heure: date.heure }, maintenant)
  if (e.etat === 'passee') return { ton: 'rouge', texte: 'Date dépassée' }
  if (e.etat === 'aujourdhui') return { ton: 'rouge', texte: 'Aujourd’hui' }
  if (e.etat === 'proche') return { ton: (e.jours ?? 99) <= 3 ? 'rouge' : 'ambre', texte: `Dans ${e.jours} jour${(e.jours ?? 0) > 1 ? 's' : ''}` }
  return null
}

/** D'où vient un point : la pièce et la page, et « Voir dans le dossier ». Texte neutre : la source n'est pas un état. */
function SourceDuPoint({ libelle, onVoir }: { libelle: string; onVoir?: () => void }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg-2">
      <span className="min-w-0 break-words">Source : {libelle}</span>
      {onVoir && <Bouton variante="lien" onClick={onVoir}>Voir dans le dossier</Bouton>}
    </p>
  )
}

/** La date limite des questions : lue dans le règlement, sans IA ; « À vérifier dans le RC » quand elle n'y est pas lisible. */
export function DateLimiteQuestions({ date, onVoir }: { date: DateQuestions | null | undefined; onVoir?: (s: SourceFait) => void }) {
  const { libelle, valeur, precision } = libelleDateQuestions(date)
  const source: SourceFait | null = date?.document ? { document: date.document, page: null, excerpt: date.extrait } : null
  const urgence = urgenceQuestions(date)
  return (
    <div data-date-questions="" className="grid gap-1 px-5 py-4 max-sm:px-4">
      <p className="text-sm font-medium text-fg-2">{libelle}</p>
      <p className={urgence ? `text-lg font-semibold ${urgence.ton === 'rouge' ? 'text-rouge-ink' : 'text-ambre-ink'}` : 'text-lg font-semibold text-fg'}>{valeur}</p>
      {urgence && (
        <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${urgence.ton === 'rouge' ? 'text-rouge-ink' : 'text-ambre-ink'}`}>
          {urgence.ton === 'rouge' ? <AlertCircle size={14} aria-hidden /> : <Clock size={14} aria-hidden />}{urgence.texte}
        </p>
      )}
      {precision && <p className="text-sm text-fg-2">{precision}</p>}
      {date?.motif && date.statut !== 'trouvee' && date.extrait && <p className="text-sm text-fg-2">{date.motif}</p>}
      {source && <SourceDuPoint libelle={libelleSource({ document: source.document, page: null }) ?? source.document} onVoir={onVoir ? () => onVoir(source) : undefined} />}
      {date?.rappel && <p className="max-w-[70ch] text-sm text-fg-2">{date.rappel}</p>}
    </div>
  )
}

/** Une question à l'acheteur : son texte, ce qui est flou, sa source dans le dossier, et « Copier » (texte prêt pour le profil d'acheteur). */
export function CartePoint({ point, numero, onVoir, onCopier, copie }: {
  point: PointAEclaircir
  numero: number
  onVoir?: (s: SourceFait) => void
  onCopier?: () => void
  copie?: boolean
}) {
  const source = point.source_document ? { document: point.source_document, page: point.source_page, excerpt: point.extrait } : null
  return (
    <div data-point-a-eclaircir="" className="flex flex-wrap items-start gap-x-6 gap-y-2 px-5 py-4 max-sm:px-4">
      <div className="grid min-w-0 flex-1 basis-80 gap-1.5">
        {/* Ce qui se copie : la question, en clair. Dessous, en plus petit, pourquoi Synorix la propose et d'où elle vient. */}
        <p className="flex max-w-[75ch] items-baseline gap-3 break-words text-fg">
          <span aria-hidden="true" className="chiffres shrink-0 text-sm text-fg-3">{numero}</span>
          <span className="min-w-0 font-semibold">{point.question}</span>
        </p>
        {point.pourquoi && <p className="max-w-[75ch] break-words pl-6 text-sm text-fg-2">{point.pourquoi}</p>}
        {source && <div className="pl-6"><SourceDuPoint libelle={libelleSource(source) ?? source.document} onVoir={onVoir ? () => onVoir(source) : undefined} /></div>}
      </div>
      <Bouton variante="secondaire" className="shrink-0 max-sm:ml-6" onClick={onCopier}>
        {copie ? <><Check size={16} aria-hidden />Copié</> : <><Copy size={16} aria-hidden />Copier la question</>}
      </Bouton>
    </div>
  )
}

/** L'invitation à préparer les questions d'un AO déjà analysé : ce que cela fait, ce que cela coûte (aucune unité). */
export function InvitationPreparer({ onPreparer, enCours, erreur, onFermerErreur }: {
  onPreparer: () => void
  enCours: boolean
  erreur: string | null
  onFermerErreur?: () => void
}) {
  return (
    <div data-invitation-questions="" className="grid gap-3 px-5 py-4 max-sm:px-4">
      <div className="min-w-0">
        <p className="font-semibold text-fg">Préparer les questions à poser à l’acheteur</p>
        <p className="mt-1 max-w-[75ch] text-sm text-fg-2">
          Synorix relit les passages du règlement, des clauses administratives et des clauses techniques qui laissent une question
          ouverte, et prépare des questions polies, prêtes à copier sur le profil d’acheteur. Cette préparation ne décompte rien de votre abonnement.
        </p>
      </div>
      {/* L'échec se dit à la place de la consigne, en mots de Synorix ; le bouton dit alors le geste : « Réessayer ». */}
      {erreur && <EchecAction message={sansJargonIA(erreur)} onFermer={onFermerErreur} />}
      <div className="flex flex-wrap items-center gap-3">
        {/* au trait : l'action de l'écran est la décision (un seul aplat) ; en cours, le libellé change, aucune roue */}
        <Bouton variante="secondaire" onClick={onPreparer} enCours={enCours} libelleEnCours="Préparation en cours…">{erreur ? 'Réessayer' : 'Préparer les questions'}</Bouton>
        {enCours && <p role="status" className="text-sm text-fg-2">Cela prend quelques secondes. Vous pouvez rester sur cette page.</p>}
      </div>
    </div>
  )
}

/** Présentation seule (testable sans réseau). `points` : undefined = pas encore préparés ; [] = rien à poser. */
export function PointsAEclaircirVue({ points, date, onVoir, preparation, copies, onCopier }: {
  points: PointAEclaircir[] | undefined
  date: DateQuestions | null | undefined
  onVoir?: (s: SourceFait) => void
  preparation: { onPreparer: () => void; enCours: boolean; erreur: string | null; onFermerErreur?: () => void }
  copies?: ReadonlySet<number>
  onCopier?: (i: number) => void
}) {
  return (
    <SectionEtape
      titre="Points à éclaircir avec l’acheteur"
      description="Les questions à poser sur le profil d’acheteur avant la date limite : contradictions entre pièces, informations que le dossier ne donne pas, quantités ou délais flous."
    >
      {/* UNE surface au trait : la date limite d'abord, puis les questions, une par ligne (plus de cartes grises de hauteurs
          forcées, plus de carte orpheline). */}
      <div data-liste-points="" className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">
        <DateLimiteQuestions date={date} onVoir={onVoir} />
        {points === undefined ? (
          <InvitationPreparer {...preparation} />
        ) : points.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-2 max-sm:px-4">
            Le dossier ne laisse aucune question ouverte : rien à poser à l’acheteur.
          </p>
        ) : (
          points.map((p, i) => (
            <CartePoint key={`${i}-${p.question.slice(0, 24)}`} point={p} numero={i + 1} onVoir={onVoir} copie={copies?.has(i)} onCopier={() => onCopier?.(i)} />
          ))
        )}
      </div>
    </SectionEtape>
  )
}

/** Le bloc de l'écran : lit les points enregistrés dans l'analyse, prépare ceux d'un AO plus ancien, copie une question. */
export default function PointsAEclaircir({ project, onOpenSource }: { project: Project; onOpenSource: (s: SourceFait) => void }) {
  const queryClient = useQueryClient()
  const [erreur, setErreur] = useState<string | null>(null)
  const [copies, setCopies] = useState<ReadonlySet<number>>(new Set())
  const points = project.infos_marche?.points_a_eclaircir

  const { data: date } = useQuery<DateQuestions>({
    queryKey: ['date-questions', project.id],
    queryFn: async () => (await api.get<DateQuestions>(`/projects/${project.id}/date-limite-questions`)).data,
    staleTime: 60_000,
  })

  const preparer = useMutation({
    mutationFn: async () => (await api.post(`/projects/${project.id}/points-a-eclaircir`, {}, { timeout: 120_000 })).data,
    onSuccess: () => {
      setErreur(null)
      void queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
    onError: async (err) => setErreur(await messageErreur(err, MESSAGE_PREPARATION)),
  })

  const copier = async (i: number) => {
    const p = points?.[i]
    if (!p || !(await copierTexte(texteACopier(p)))) return
    setCopies((c) => new Set(c).add(i))
    window.setTimeout(() => setCopies((c) => { const s = new Set(c); s.delete(i); return s }), 2500)
  }

  return (
    <PointsAEclaircirVue
      points={points}
      date={date}
      onVoir={onOpenSource}
      preparation={{ onPreparer: () => { setErreur(null); preparer.mutate() }, enCours: preparer.isPending, erreur, onFermerErreur: () => setErreur(null) }}
      copies={copies}
      onCopier={(i) => { void copier(i) }}
    />
  )
}

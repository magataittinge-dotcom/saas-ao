import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2, MessageSquareText } from 'lucide-react'
import { api } from '@/services/api'
import { EtatElement, SectionEtape } from '@/components/etape'
import EchecAction from '@/components/common/EchecAction'
import { Button } from '@/components/ui/button'
import { messageErreur } from '@/lib/erreurs'
import { copierTexte } from '@/lib/copier'
import { libelleSource, libelleDateQuestions, texteACopier, type DateQuestions } from '@/lib/resumeAO'
import type { SourceFait } from '@/lib/carteAO'
import type { PointAEclaircir, Project } from '@/types'

const MESSAGE_PREPARATION = "Les questions n'ont pas pu être préparées. Réessayez dans un instant."

/** La date limite des questions : lue dans le règlement, sans IA ; « À vérifier dans le RC » quand elle n'y est pas lisible. */
export function DateLimiteQuestions({ date, onVoir }: { date: DateQuestions | null | undefined; onVoir?: (s: SourceFait) => void }) {
  const { valeur, precision } = libelleDateQuestions(date)
  const source: SourceFait | null = date?.document ? { document: date.document, page: null, excerpt: date.extrait } : null
  return (
    <div className="grid gap-1.5 rounded-carte border border-bord-2 bg-surface-1 p-5">
      <p className="text-sm font-medium text-fg-2">Date limite des questions</p>
      <p className="font-display text-h6 text-fg">{valeur}</p>
      {precision && <p className="text-sm text-fg-2">{precision}</p>}
      {date?.motif && date.statut !== 'trouvee' && date.extrait && <p className="text-sm text-fg-2">{date.motif}</p>}
      {source && (
        <EtatElement
          etat={date?.statut === 'trouvee' ? 'pret' : 'a-verifier'}
          source={{ libelle: libelleSource({ document: source.document, page: null }) ?? source.document, onVoir: onVoir ? () => onVoir(source) : undefined }}
        />
      )}
      {date?.rappel && <p className="text-sm text-fg-3">{date.rappel}</p>}
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
    <li data-point-a-eclaircir="" className="grid min-w-0 content-start gap-2.5 rounded-carte border border-bord-2 bg-surface-1 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="shrink-0 pt-0.5 text-xs tabular-nums tracking-[0.06em] text-fg-3">{String(numero).padStart(2, '0')}</span>
        <p className="min-w-0 flex-1 break-words font-semibold text-fg">{point.question}</p>
      </div>
      {point.pourquoi && <p className="break-words text-sm text-fg-2">{point.pourquoi}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-bord-2 pt-2.5">
        <EtatElement
          etat="a-verifier"
          source={source ? { libelle: libelleSource(source) ?? source.document, onVoir: onVoir ? () => onVoir(source) : undefined } : undefined}
        />
        <Button type="button" variant="outline" size="sm" onClick={onCopier} className="[@media(pointer:coarse)]:min-h-11">
          {copie ? <><Check size={14} aria-hidden />Copié</> : <><Copy size={14} aria-hidden />Copier la question</>}
        </Button>
      </div>
    </li>
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
    <div className="grid gap-3 rounded-carte border border-bord-2 bg-surface-1 p-5">
      <div className="flex items-start gap-3">
        <MessageSquareText size={18} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-fg">Préparer les questions à poser à l’acheteur</p>
          <p className="mt-1 text-sm text-fg-2">
            Synorix relit les passages du règlement, des clauses administratives et des clauses techniques qui laissent une question
            ouverte, et prépare des questions polies, prêtes à copier sur le profil d’acheteur. Ne décompte aucune unité.
          </p>
        </div>
      </div>
      {erreur && <EchecAction message={erreur} onFermer={onFermerErreur} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onPreparer} disabled={enCours} aria-busy={enCours}>
          {enCours ? <><Loader2 size={16} className="animate-spin" aria-hidden />Préparation en cours…</> : 'Préparer les questions'}
        </Button>
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
      description="Les questions à poser sur le profil d’acheteur avant la date limite : contradictions entre pièces, informations que le dossier ne donne pas, quantités ou délais flous."
      colonnes={2}
    >
      <DateLimiteQuestions date={date} onVoir={onVoir} />
      {points === undefined ? (
        <InvitationPreparer {...preparation} />
      ) : points.length === 0 ? (
        <p className="rounded-carte border border-bord-2 bg-surface-1 p-5 text-sm text-fg-2">
          Le dossier ne laisse aucune question ouverte : rien à poser à l’acheteur.
        </p>
      ) : (
        <>
          {points.map((p, i) => (
            <CartePoint key={`${i}-${p.question.slice(0, 24)}`} point={p} numero={i + 1} onVoir={onVoir} copie={copies?.has(i)} onCopier={() => onCopier?.(i)} />
          ))}
        </>
      )}
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

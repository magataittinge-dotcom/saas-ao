import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, CircleHelp, ListChecks } from 'lucide-react'
import { api, getSignedFileUrl } from '@/services/api'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { EtatErreur } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { SqueletteLignes } from '@/components/ui/squelette'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import { reponseDeChamp } from '@/lib/ancre'
import { PASSAGE_INTROUVABLE } from '@/lib/pieceCitee'
import { allerALAncre, resumeRelecture, type LigneRelecture, type ReponseRelecture, type SourceLigne, type TypeLigne } from '@/lib/relectureMemoire'
import { cn } from '@/lib/utils'
import type { ProjectDocument } from '@/types'

/**
 * La couleur d'une ligne dit son poids (COULEURS.md), toujours avec son mot et son icône : rouge = à reprendre avant le
 * dépôt (un passage resté à compléter, une longueur au-delà de la limite du règlement) ; ambre = à vérifier.
 */
const BLOQUANT: ReadonlySet<TypeLigne> = new Set<TypeLigne>(['a_completer', 'longueur'])

/** La liste courte : une rangée à filet par point à reprendre, ou « Conforme » et une phrase sobre quand tout va bien. */
export function ListeRelecture({ donnees, onAller, onSource }: {
  donnees: ReponseRelecture
  onAller: (ligne: LigneRelecture) => void
  onSource: (source: SourceLigne) => void
}) {
  if (donnees.lignes.length === 0) {
    return (
      <div className="space-y-2">
        <PastilleEtat sens="vert" icone={Check}>Conforme</PastilleEtat>
        <p className="text-sm text-fg-2">{donnees.message}</p>
      </div>
    )
  }
  return (
    <ul>
      {donnees.lignes.map((l, i) => {
        const bloquant = BLOQUANT.has(l.type)
        return (
          <li key={`${l.type}-${i}`} className="border-t border-bord py-3 first:border-t-0 first:pt-0" data-ligne={l.type} data-poids={bloquant ? 'bloquant' : 'a-verifier'}>
            <PastilleEtat sens={bloquant ? 'rouge' : 'ambre'} icone={bloquant ? AlertCircle : CircleHelp}>{l.libelle}</PastilleEtat>
            <p className="mt-1.5 min-w-0 break-words text-sm font-medium text-fg">{l.texte}</p>
            {l.detail && <p className="mt-0.5 text-xs text-fg-3">{l.detail}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
              {l.ancre && l.section && (
                <Bouton variante="lien" onClick={() => onAller(l)} className="h-auto min-h-9 whitespace-normal text-left">Aller à : {l.section}</Bouton>
              )}
              {l.lien && <Link to={l.lien} className={classesBouton('lien', 'min-h-9')}>Renseigner dans Mon entreprise</Link>}
              {l.source && <Bouton variante="lien" onClick={() => onSource(l.source as SourceLigne)} className="min-h-9">Voir dans le dossier</Bouton>}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Le bouton « Relire mon mémoire » et son tiroir (la feuille du système : piège de focus, Échap, retour du focus, voile).
 * Le contrôle est fait par le serveur, sans IA ni coût : sous-critères du règlement, pièces de l'offre technique, passages
 * à compléter, DTU hors liste, longueur.
 */
export default function RelectureMemoire({ projectId }: { projectId: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const [avis, setAvis] = useState<string | null>(null)
  const changer = (o: boolean) => { setOuvert(o); if (!o) { setSelection(null); setAvis(null) } }

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['relecture-memoire', projectId],
    queryFn: async () => (await api.get<ReponseRelecture>(`/projects/${projectId}/memoire/relecture`)).data,
    enabled: ouvert,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const { data: docs = [] } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: async () => (await api.get<ProjectDocument[]>(`/projects/${projectId}/documents`)).data,
    enabled: ouvert,
  })

  const aller = (l: LigneRelecture) => {
    if (!l.ancre) return
    changer(false)
    // le tiroir se ferme (le focus revient au bouton), puis la page remonte au passage
    window.setTimeout(() => { allerALAncre(l.ancre) }, 120)
  }

  const ouvrirSource = async (source: SourceLigne) => {
    setAvis(null)
    if (source.type === 'exigence') { setSelection({ type: 'exigence', id: source.id }); return }
    const doc = docs.find((d) => d.file_name === source.document)
    if (!doc) { setAvis(PASSAGE_INTROUVABLE); return }
    if (doc.file_url.startsWith('http')) { window.open(doc.file_url, '_blank'); return }
    try {
      const origine = await getSignedFileUrl(doc.file_url)
      const pdfRel = [doc.file_url, doc.pdf_preview_url].find((u) => u && u.toLowerCase().endsWith('.pdf')) ?? null
      const pdf = pdfRel === null ? null : pdfRel === doc.file_url ? origine : await getSignedFileUrl(pdfRel)
      setSelection({ type: 'champ', nombrePages: doc.page_count ?? null, reponse: reponseDeChamp(doc, { page: source.page, excerpt: source.excerpt }, { pdf, origine }) })
    } catch {
      setAvis('Le document source n’a pas pu s’ouvrir. Réessayez dans un instant.')
    }
  }

  return (
    <>
      <Bouton variante="secondaire" onClick={() => changer(true)}>
        <ListChecks aria-hidden="true" /> {resumeRelecture(data && ouvert ? data : null)}
      </Bouton>
      <Sheet open={ouvert} onOpenChange={changer}>
        <SheetContent
          side="right" data-relecture=""
          className={cn('flex w-full flex-col gap-0 bg-surface-0 p-0 sm:max-w-none', selection ? 'sm:w-[min(46rem,100vw)]' : 'sm:w-[min(30rem,100vw)]')}
        >
          <header className="shrink-0 border-b border-bord px-5 py-4 pr-14">
            <SheetTitle className="text-lg font-semibold text-fg">Relire mon mémoire</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-fg-2">
              Contrôle sur le texte, sans IA : critères du règlement, pièces, passages à compléter, DTU, longueur.
            </SheetDescription>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {selection ? (
              <div className="space-y-3">
                <Bouton variante="lien" onClick={() => setSelection(null)} className="min-h-9">
                  <ArrowLeft aria-hidden="true" /> Retour à la relecture
                </Bouton>
                <PanneauSource
                  key={selection.type === 'exigence' ? selection.id : `champ-${selection.reponse.doc_id}-${selection.reponse.page}`}
                  selection={selection} onFermer={() => setSelection(null)}
                />
              </div>
            ) : isFetching && !data ? (
              <div role="status" aria-busy="true">
                <span className="sr-only">Relecture du mémoire…</span>
                <SqueletteLignes lignes={6} />
              </div>
            ) : isError || !data ? (
              <EtatErreur
                titre="La relecture n’a pas pu se faire"
                detail="La connexion au serveur a échoué. Votre mémoire n’est pas touché."
                onReessayer={() => { void refetch() }} enCours={isFetching}
                className="border-0 px-0 shadow-none"
              />
            ) : (
              <div className="space-y-4">
                <ListeRelecture donnees={data} onAller={aller} onSource={ouvrirSource} />
                {data.limite_pages !== null && (
                  <p className="border-t border-bord pt-3 text-xs text-fg-3">Longueur estimée : environ {data.pages_estimees} pages, pour {data.limite_pages} au plus dans le règlement.</p>
                )}
                {avis && <Message ton="attention">{avis}</Message>}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

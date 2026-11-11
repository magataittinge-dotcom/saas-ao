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
 * La couleur d'un groupe dit son poids (COULEURS.md), toujours avec son mot et son icône : rouge = hors de la limite du
 * règlement (la longueur) ; ambre = à renseigner ou à vérifier (un passage resté à compléter, un critère à couvrir).
 */
const BLOQUANT: ReadonlySet<TypeLigne> = new Set<TypeLigne>(['longueur'])

/** « 6 passages : nom ; nom ; nom … » : une précision répétée ne se dit qu'une fois, et ne finit pas sur des points de suspension. */
export function detailLisible(detail: string): string {
  const [tete, ...reste] = detail.split(/\s:\s/)
  if (reste.length === 0) return detail
  const coupe = /…\s*$/.test(detail)
  const uniques = [...new Set(reste.join(' : ').replace(/\s*…\s*$/, '').split(/\s*;\s*/).map((m) => m.trim()).filter(Boolean))]
  // une liste coupée par le serveur le dit en mots, pas par des points de suspension au milieu d'une phrase
  return `${tete} : ${uniques.join(' ; ')}${coupe && uniques.length > 1 ? ', entre autres' : ''}`
}

/** Les points à reprendre, rangés sous leur mot (« À compléter », « À couvrir »…), dans l'ordre où ces mots apparaissent. */
export function groupesRelecture(lignes: readonly LigneRelecture[]): { libelle: string; bloquant: boolean; lignes: LigneRelecture[] }[] {
  const groupes: { libelle: string; bloquant: boolean; lignes: LigneRelecture[] }[] = []
  for (const l of lignes) {
    const groupe = groupes.find((g) => g.libelle === l.libelle)
    if (groupe) groupe.lignes.push(l)
    else groupes.push({ libelle: l.libelle, bloquant: BLOQUANT.has(l.type), lignes: [l] })
  }
  return groupes
}

/**
 * La liste courte : les points à reprendre, rangés sous leur mot, dit UNE fois en tête de groupe avec son compte (jury,
 * tour 1 : trente pastilles rouges identiques ne triaient rien) ; ou « Conforme » et une phrase sobre quand tout va bien.
 */
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
    <div className="space-y-6">
      {groupesRelecture(donnees.lignes).map((g) => (
        <section key={g.libelle} data-groupe-relecture="">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <PastilleEtat sens={g.bloquant ? 'rouge' : 'ambre'} icone={g.bloquant ? AlertCircle : CircleHelp}>{g.libelle}</PastilleEtat>
            <span className="font-medium text-fg-3">{g.lignes.length} {g.lignes.length > 1 ? 'points' : 'point'}</span>
          </h3>
          <ul className="mt-2">
            {g.lignes.map((l, i) => (
              <li key={`${l.type}-${i}`} className="border-t border-bord py-3" data-ligne={l.type} data-poids={g.bloquant ? 'bloquant' : 'a-verifier'}>
                <p className="min-w-0 break-words text-sm font-medium text-fg">{detailLisible(l.texte)}</p>
                {l.detail && <p className="mt-0.5 break-words text-xs text-fg-3">{detailLisible(l.detail)}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
                  {l.ancre && l.section && (
                    <Bouton variante="lien" onClick={() => onAller(l)} className="h-auto min-h-9 whitespace-normal text-left">Aller à : {l.section}</Bouton>
                  )}
                  {l.lien && <Link to={l.lien} className={classesBouton('lien', 'min-h-9')}>Renseigner dans Mon entreprise</Link>}
                  {l.source && <Bouton variante="lien" onClick={() => onSource(l.source as SourceLigne)} className="min-h-9">Voir dans le dossier</Bouton>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
            <SheetTitle className="font-memoire text-xl font-semibold text-fg">Relire mon mémoire</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-fg-2">
              Synorix compare votre texte au règlement, sans le réécrire : critères, pièces citées, passages à compléter, normes citées, longueur.
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
                {data.nombre > 0 && (
                  <p className="text-sm text-fg-2"><span className="font-semibold text-fg">{resumeRelecture(data)}</span> avant le dépôt, rangés par nature. Chaque point mène à son passage.</p>
                )}
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

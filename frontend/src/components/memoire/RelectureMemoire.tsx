import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, ListChecks, Loader2, X } from 'lucide-react'
import { api, getSignedFileUrl } from '@/services/api'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import { reponseDeChamp } from '@/lib/ancre'
import { PASSAGE_INTROUVABLE } from '@/lib/pieceCitee'
import { allerALAncre, resumeRelecture, type LigneRelecture, type ReponseRelecture, type SourceLigne } from '@/lib/relectureMemoire'
import type { ProjectDocument } from '@/types'

const BOUTON = 'flex items-center gap-1.5 text-sm font-medium py-1.5 px-3.5 rounded-lg transition-colors hover:bg-ds-bg-2 [@media(pointer:coarse)]:min-h-11'

/** La liste courte : une ligne par point à reprendre, ou une phrase sobre quand tout va bien. */
export function ListeRelecture({ donnees, onAller, onSource }: {
  donnees: ReponseRelecture
  onAller: (ligne: LigneRelecture) => void
  onSource: (source: SourceLigne) => void
}) {
  if (donnees.lignes.length === 0) {
    return (
      <p className="flex items-start gap-2 text-sm text-fg-2">
        <Check size={16} className="mt-0.5 shrink-0 text-vert-ink" aria-hidden="true" />
        <span>{donnees.message}</span>
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {donnees.lignes.map((l, i) => (
        <li key={`${l.type}-${i}`} className="rounded-lg border border-bord-2 bg-surface-1 p-3" data-ligne={l.type}>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-ambre-ink"><AlertCircle size={12} aria-hidden="true" />{l.libelle}</span>
            <span className="min-w-0 break-words text-sm font-medium text-fg">{l.texte}</span>
          </p>
          {l.detail && <p className="mt-0.5 text-xs text-fg-3">{l.detail}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {l.ancre && l.section && (
              <button type="button" onClick={() => onAller(l)} className="min-h-8 rounded-xs text-left text-accent-text underline-offset-[3px] hover:underline [@media(pointer:coarse)]:min-h-11">
                Aller à : {l.section}
              </button>
            )}
            {l.lien && (
              <Link to={l.lien} className="min-h-8 rounded-xs text-accent-text underline-offset-[3px] hover:underline [@media(pointer:coarse)]:min-h-11">
                Renseigner dans Mon entreprise
              </Link>
            )}
            {l.source && (
              <button type="button" onClick={() => onSource(l.source as SourceLigne)} className="min-h-8 rounded-xs text-left text-fg-2 underline-offset-[3px] hover:text-fg hover:underline [@media(pointer:coarse)]:min-h-11">
                Voir dans le dossier
              </button>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * Le bouton « Relire mon mémoire » et son tiroir. Le contrôle est fait par le serveur, sans IA ni coût :
 * sous-critères du règlement, pièces de l'offre technique, passages à compléter, DTU hors liste, longueur.
 */
export default function RelectureMemoire({ projectId }: { projectId: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const [avis, setAvis] = useState<string | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const fermer = useCallback(() => { setOuvert(false); setSelection(null); setAvis(null); bouton.current?.focus() }, [])

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

  useEffect(() => {
    if (!ouvert) return
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selection) fermer() }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [ouvert, selection, fermer])

  const aller = (l: LigneRelecture) => {
    if (!l.ancre) return
    fermer()
    // le tiroir se ferme, puis la page remonte au passage
    window.setTimeout(() => { allerALAncre(l.ancre) }, 0)
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
      setAvis("Le document source n'a pas pu s'ouvrir. Réessayez dans un instant.")
    }
  }

  return (
    <>
      <button ref={bouton} type="button" onClick={() => setOuvert(true)} className={BOUTON} style={{ border: '1px solid var(--border-1)', color: 'var(--text-2)' }}>
        <ListChecks size={13} aria-hidden="true" /> {resumeRelecture(data && ouvert ? data : null)}
      </button>
      {ouvert && createPortal(
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-voile" onClick={fermer} aria-hidden="true" />
          <aside
            role="dialog" aria-label="Relire mon mémoire"
            className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-bord-2 bg-popover shadow-pop ${selection ? 'sm:w-[min(46rem,100vw)]' : 'sm:w-[min(30rem,100vw)]'}`}
          >
            <header className="flex items-start justify-between gap-3 border-b border-bord-2 px-4 py-3">
              <div className="min-w-0">
                <h2 className="font-display text-base text-fg">Relire mon mémoire</h2>
                <p className="mt-0.5 text-xs text-fg-3">Contrôle sur le texte, sans IA : critères du règlement, pièces, passages à compléter, DTU, longueur.</p>
              </div>
              <button type="button" onClick={fermer} aria-label="Fermer la relecture" className="grid size-10 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-surface-1 hover:text-fg">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {selection ? (
                <div className="space-y-3">
                  <button type="button" onClick={() => setSelection(null)} className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg [@media(pointer:coarse)]:min-h-11">
                    <ArrowLeft size={14} aria-hidden="true" /> Retour à la relecture
                  </button>
                  <PanneauSource
                    key={selection.type === 'exigence' ? selection.id : `champ-${selection.reponse.doc_id}-${selection.reponse.page}`}
                    selection={selection} onFermer={() => setSelection(null)}
                  />
                </div>
              ) : isFetching && !data ? (
                <p role="status" className="flex items-center gap-2 text-sm text-fg-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Relecture du mémoire…</p>
              ) : isError || !data ? (
                <div className="space-y-2 text-sm text-fg-2" role="status">
                  <p>La relecture n'a pas pu se faire pour le moment.</p>
                  <button type="button" onClick={() => refetch()} className="text-accent-text underline-offset-[3px] hover:underline">Réessayer</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <ListeRelecture donnees={data} onAller={aller} onSource={ouvrirSource} />
                  {data.limite_pages !== null && (
                    <p className="text-xs text-fg-3">Longueur estimée : environ {data.pages_estimees} pages, pour {data.limite_pages} au plus dans le règlement.</p>
                  )}
                  {avis && <p role="status" className="text-[13px] text-ambre-ink">{avis}</p>}
                </div>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}

import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api, getSignedFileUrl } from '@/services/api'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import EchecAction from '@/components/common/EchecAction'
import { reponseDeChamp } from '@/lib/ancre'
import { PASSAGE_INTROUVABLE } from '@/lib/pieceCitee'
import type { ProjectDocument } from '@/types'

export interface SourceChamp {
  document: string
  page: number | null
  excerpt: string | null
}

/**
 * « Voir dans le dossier » pour un fait dont l'analyse a gardé la source (document, page, extrait) :
 * même ouverture que l'écran d'analyse (panneau à trois vues, feuille sur téléphone). `panneau` est à
 * poser une fois dans l'écran ; `ouvrir(source)` l'ouvre.
 */
export function useSourceChamp(projectId: string): { ouvrir: (source: SourceChamp) => void; panneau: ReactNode; ouvert: boolean } {
  const { data: pieces = [] } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: async () => (await api.get<ProjectDocument[]>(`/projects/${projectId}/documents`)).data,
  })
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const [avis, setAvis] = useState<{ message: string; relancer?: () => void } | null>(null)

  const ouvrir = useCallback(async (src: SourceChamp) => {
    const doc = pieces.find((d) => d.file_name === src.document)
    if (!doc) { setAvis({ message: PASSAGE_INTROUVABLE }); return }
    if (doc.file_url.startsWith('http')) { window.open(doc.file_url, '_blank'); return }
    try {
      const origine = await getSignedFileUrl(doc.file_url)
      const pdfRel = [doc.file_url, doc.pdf_preview_url].find((u) => u && u.toLowerCase().endsWith('.pdf')) ?? null
      const pdf = pdfRel === null ? null : pdfRel === doc.file_url ? origine : await getSignedFileUrl(pdfRel)
      setSelection({
        type: 'champ', nombrePages: doc.page_count ?? null,
        reponse: reponseDeChamp(doc, { page: src.page, excerpt: src.excerpt }, { pdf, origine }),
      })
      setAvis(null)
    } catch {
      setAvis({ message: "Le document source n’a pas pu s’ouvrir.", relancer: () => { void ouvrir(src) } })
    }
  }, [pieces])

  const panneau = (
    <>
      {selection && (
        <div className="memoire-source-colonne">
          <PanneauSource
            key={selection.type === 'champ' ? `champ-${selection.reponse.doc_id}-${selection.reponse.page}` : 'x'}
            selection={selection}
            onFermer={() => setSelection(null)}
          />
        </div>
      )}
      {avis && createPortal(
        <div className="fixed bottom-20 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4">
          <EchecAction
            message={avis.message}
            onReessayer={avis.relancer ? () => { const relancer = avis.relancer!; setAvis(null); relancer() } : undefined}
            onFermer={() => setAvis(null)}
          />
        </div>,
        document.body,
      )}
    </>
  )
  return { ouvrir: (s) => { void ouvrir(s) }, panneau, ouvert: selection !== null }
}

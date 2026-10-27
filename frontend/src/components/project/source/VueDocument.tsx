import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { rectsAffiches, type ReponseSource } from '@/lib/ancre'
import { useLargeur } from '@/hooks/useMedia'
import { CalqueSurligne, useCentrer } from './FeuilleSource'

// Worker pdf.js embarqué par Vite (pas de CDN : CSP du produit).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// Le document est lu par morceaux : plages HTTP (le serveur répond 206 / X-Accel-Redirect), sans
// pré-chargement du reste du fichier. Objet stable : react-pdf recharge le document si ses options
// changent d'identité.
// `disableStream: true` : avec le flux continu (false), pdf.js lit la réponse complète EN PLUS des
// plages demandées. Mesuré (serveur de plages local, pièce de 1,66 Mo) : 1,68 Mo envoyés avec
// `true` (la requête initiale est coupée après 16 Ko), 3,06 Mo avec `false`. C'est la configuration
// du prototype du sujet A (17 Mo : 2,9 Mo reçus).
const OPTIONS_PDFJS = {
  disableAutoFetch: true,
  disableStream: true,
  rangeChunkSize: 65536,
} as const

interface Props {
  reponse: ReponseSource
  url: string
  page: number
  onPage: (numero: number) => void
  onNombrePages: (n: number) => void
  /** Défilement du corps du panneau, pour centrer le passage. */
  conteneurRef: React.RefObject<HTMLElement>
}

/** La pièce entière dans pdf.js (sans recherche : ni couche de texte, ni annotations), à la largeur
 *  du panneau, avec les rectangles de l'ancre sur la page citée. */
export default function VueDocument({ reponse, url, page, onPage, onNombrePages, conteneurRef }: Props) {
  const [zone, largeur] = useLargeur<HTMLDivElement>()
  const [total, setTotal] = useState<number | null>(null)
  const [echec, setEchec] = useState(false)
  const [rendue, setRendue] = useState<number | null>(null)
  const feuilleRef = useRef<HTMLDivElement>(null)
  const fichier = useMemo(() => ({ url }), [url])

  const surLaPage = page === reponse.page ? rectsAffiches(reponse, 'principale')
    : reponse.suite && page === reponse.suite.page ? rectsAffiches(reponse, 'suite') : []
  useCentrer(conteneurRef, feuilleRef, surLaPage, rendue === page, `doc|${page}`)

  useEffect(() => { setRendue(null) }, [page])

  if (echec) {
    return (
      <div className="source-vide" role="status">
        <p>Le document n&rsquo;a pas pu s&rsquo;afficher ici.</p>
        {reponse.document?.origine && (
          <a href={reponse.document.origine} target="_blank" rel="noreferrer" className="source-bouton">Ouvrir la pièce</a>
        )}
      </div>
    )
  }

  return (
    <div ref={zone} className="source-document">
      <Document
        file={fichier}
        options={OPTIONS_PDFJS}
        onLoadSuccess={({ numPages }) => { setTotal(numPages); onNombrePages(numPages) }}
        onLoadError={() => setEchec(true)}
        loading={<div className="source-squelette" role="status" aria-label="Chargement du document" />}
      >
        {largeur > 0 && (
          <div ref={feuilleRef} className="source-feuille" data-chargee={rendue === page ? 'oui' : 'non'}>
            <Page
              pageNumber={page}
              width={largeur}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onRenderSuccess={() => setRendue(page)}
              loading={<div className="source-squelette" aria-hidden="true" />}
            />
            {rendue === page && <CalqueSurligne rects={surLaPage} />}
          </div>
        )}
      </Document>
      {total !== null && (reponse.suite && page === reponse.page) && (
        <div className="source-suite">
          <p>Le passage se poursuit page {reponse.suite.page}.</p>
          <button type="button" className="source-bouton" onClick={() => onPage(reponse.suite!.page)}>
            Aller à la page {reponse.suite.page}
          </button>
        </div>
      )}
    </div>
  )
}

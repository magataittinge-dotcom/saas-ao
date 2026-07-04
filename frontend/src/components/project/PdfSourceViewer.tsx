import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Worker pdf.js embarqué par Vite (pas de CDN — CSP du produit).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface Props {
  /** URL signée complète (avec page+highlight — le surlignage jaune est
   *  appliqué côté serveur, strictement verbatim, jamais de faux surlignage). */
  fileUrl: string
  fileName: string
  initialPage: number
  onClose: () => void
}

/**
 * C6 — viewer PDF intégré : ouvre le document à la bonne page, l'excerpt
 * entier surligné en jaune quand il est retrouvé verbatim.
 */
export default function PdfSourceViewer({ fileUrl, fileName, initialPage, onClose }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [page, setPage] = useState(Math.max(1, initialPage))
  const [failed, setFailed] = useState(false)

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.20)' }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold truncate flex-1" style={{ color: '#0F172A' }}>{fileName}</p>
          {numPages && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1 rounded disabled:opacity-30 hover:bg-slate-100">
                <ChevronLeft size={14} />
              </button>
              page {page} / {numPages}
              <button onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}
                className="p-1 rounded disabled:opacity-30 hover:bg-slate-100">
                <ChevronRight size={14} />
              </button>
            </span>
          )}
          <a href={fileUrl} target="_blank" rel="noreferrer" title="Ouvrir dans un onglet"
            className="p-1.5 rounded hover:bg-slate-100" style={{ color: '#64748B' }}>
            <ExternalLink size={15} />
          </a>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100" style={{ color: '#64748B' }}>
            <X size={16} />
          </button>
        </div>

        {/* Document */}
        <div className="flex-1 overflow-auto flex justify-center py-4" style={{ background: '#F1F5F9' }}>
          {failed ? (
            <div className="self-center text-center">
              <p className="text-sm" style={{ color: '#64748B' }}>Impossible d'afficher ce PDF ici.</p>
              <a href={fileUrl} target="_blank" rel="noreferrer"
                className="text-sm font-medium underline" style={{ color: '#0EA5E9' }}>
                Ouvrir dans un onglet
              </a>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={() => setFailed(true)}
              loading={<Loader2 size={22} className="animate-spin self-center" style={{ color: '#0EA5E9' }} />}
            >
              <Page pageNumber={page} width={780} renderAnnotationLayer renderTextLayer={false} />
            </Document>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

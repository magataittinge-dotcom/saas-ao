import { useState, useEffect, useCallback, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileText, Download } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

interface Props {
  fileUrl: string
  fileName: string
  targetPage?: number
  searchText?: string
  onClose: () => void
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

function getFullUrl(fileUrl: string): string {
  if (fileUrl.startsWith('http')) return fileUrl
  return `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${fileUrl}`
}

export default function PdfViewerModal({ fileUrl, fileName, targetPage = 1, searchText, onClose }: Props) {
  const isPdf = isPdfFile(fileName)
  const fullUrl = getFullUrl(fileUrl)

  if (!isPdf) {
    return (
      <NonPdfModal
        fullUrl={fullUrl}
        fileName={fileName}
        targetPage={targetPage}
        searchText={searchText}
        onClose={onClose}
      />
    )
  }

  return (
    <PdfViewer
      fullUrl={fullUrl}
      fileName={fileName}
      targetPage={targetPage}
      searchText={searchText}
      onClose={onClose}
    />
  )
}

// ─── Modal pour fichiers non-PDF (DOCX, XLSX, etc.) ──────────────────────────

function NonPdfModal({ fullUrl, fileName, targetPage, searchText, onClose }: {
  fullUrl: string
  fileName: string
  targetPage?: number
  searchText?: string
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const ext = fileName.split('.').pop()?.toUpperCase() || 'FICHIER'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-xl p-8 max-w-lg w-full mx-4 text-center space-y-5"
        style={{
          background: '#0D1117',
          border: '1px solid rgba(14,165,233,0.15)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(14,165,233,0.08)'
        }}
      >
        <div className="flex justify-end">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-red-500/10 text-ds-text-3 hover:text-red-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.20)' }}
        >
          <FileText size={32} className="text-ds-cyan" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-ds-text">{fileName}</h3>
          <p className="text-sm text-ds-text-2 mt-1">
            Fichier {ext} — la prévisualisation n&apos;est disponible que pour les PDF
          </p>
        </div>

        {(targetPage || searchText) && (
          <div
            className="rounded-lg p-3 text-left space-y-1"
            style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.12)' }}
          >
            {targetPage && (
              <p className="text-xs text-ds-text-2">
                <span className="text-ds-text-3">Page :</span> {targetPage}
              </p>
            )}
            {searchText && (
              <p className="text-xs text-ds-text-2">
                <span className="text-ds-text-3">Passage :</span>{' '}
                <span className="italic">«{searchText.substring(0, 150)}{searchText.length > 150 ? '...' : ''}»</span>
              </p>
            )}
          </div>
        )}

        <a
          href={fullUrl}
          download={fileName}
          className="btn-primary inline-flex items-center gap-2 px-6 py-2.5"
        >
          <Download size={16} />
          Télécharger le fichier
        </a>
      </div>
    </div>
  )
}

// ─── Viewer PDF intégré ──────────────────────────────────────────────────────

function PdfViewer({ fullUrl, fileName, targetPage = 1, searchText, onClose }: {
  fullUrl: string
  fileName: string
  targetPage?: number
  searchText?: string
  onClose: () => void
}) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(targetPage)
  const [scale, setScale] = useState(1.2)
  const [isLoaded, setIsLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(numPages || p, p + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, numPages])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n)
    setCurrentPage(Math.min(targetPage, n))
    setIsLoaded(true)
  }, [targetPage])

  const onPageRenderSuccess = useCallback(() => {
    if (!searchText || !pageRef.current) return

    setTimeout(() => {
      const textLayer = pageRef.current?.querySelector('.react-pdf__Page__textContent')
      if (!textLayer) return

      textLayer.querySelectorAll('.synorix-highlight').forEach(el => el.remove())

      const spans = textLayer.querySelectorAll('span')
      const normalizedSearch = searchText.toLowerCase().replace(/\s+/g, ' ').trim()

      let fullText = ''
      const spanMap: { start: number; end: number; span: Element }[] = []

      spans.forEach(span => {
        const text = span.textContent || ''
        spanMap.push({ start: fullText.length, end: fullText.length + text.length, span })
        fullText += text
      })

      const normalizedFull = fullText.toLowerCase().replace(/\s+/g, ' ')
      const containerRect = textLayer.getBoundingClientRect()
      const matchedRects: DOMRect[] = []

      // ── Découpage en segments ~45 chars (même logique que le backend) ──────
      const splitIntoSegments = (text: string, targetLen = 45, minLen = 15): string[] => {
        const segments: string[] = []
        let remaining = text
        while (remaining.length > 0) {
          if (remaining.length <= targetLen) {
            if (remaining.length >= minLen) segments.push(remaining)
            break
          }
          let cut = remaining.lastIndexOf(' ', targetLen)
          if (cut < minLen) cut = targetLen
          const segment = remaining.slice(0, cut).trim()
          if (segment.length >= minLen) segments.push(segment)
          remaining = remaining.slice(cut).trim()
        }
        return segments
      }

      const highlightRange = (matchIndex: number, matchEnd: number) => {
        spanMap.forEach(({ start, end, span }) => {
          if (start < matchEnd && end > matchIndex) {
            const rect = span.getBoundingClientRect()
            const el = document.createElement('div')
            el.className = 'synorix-highlight'
            el.style.cssText = `
              position: absolute;
              left: ${rect.left - containerRect.left - 2}px;
              top: ${rect.top - containerRect.top - 1}px;
              width: ${rect.width + 4}px;
              height: ${rect.height + 2}px;
              background: rgba(14, 165, 233, 0.25);
              border: 1px solid rgba(14, 165, 233, 0.5);
              border-radius: 2px;
              pointer-events: none;
              z-index: 1;
              animation: highlightPulse 2s ease-in-out 3;
            `
            textLayer.appendChild(el)
            matchedRects.push(rect)
          }
        })
      }

      // Chercher chaque segment et surligner les spans couverts
      const segments = splitIntoSegments(normalizedSearch)
      let anyMatch = false
      for (const segment of segments) {
        const idx = normalizedFull.indexOf(segment)
        if (idx !== -1) {
          highlightRange(idx, idx + segment.length)
          anyMatch = true
        }
      }

      // Fallback : première occurrence des 50 premiers chars si aucun segment ne matche
      if (!anyMatch) {
        const searchShort = normalizedSearch.substring(0, 50)
        const matchIndex = normalizedFull.indexOf(searchShort)
        if (matchIndex !== -1) {
          const matchEnd = matchIndex + Math.min(normalizedSearch.length, normalizedFull.length - matchIndex)
          highlightRange(matchIndex, matchEnd)
        }
      }

      // Scroll to first highlight after render
      const firstHighlight = textLayer.querySelector('.synorix-highlight')
      if (firstHighlight) {
        setTimeout(() => {
          firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }, 500)
  }, [searchText])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`
        @keyframes highlightPulse {
          0%, 100% { background: rgba(14, 165, 233, 0.25); }
          50% { background: rgba(14, 165, 233, 0.45); }
        }
      `}</style>

      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          width: '85vw',
          height: '90vh',
          background: '#0D1117',
          border: '1px solid rgba(14,165,233,0.15)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(14,165,233,0.08)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(14,165,233,0.10)', background: 'rgba(14,165,233,0.03)' }}
        >
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-ds-text truncate max-w-md">{fileName}</div>
            {searchText && (
              <div
                className="text-xs px-2 py-0.5 rounded-full text-ds-cyan-dark"
                style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' }}
              >
                Passage surligné
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1.5 rounded hover:bg-[#F1F5F9] text-ds-text-3 hover:text-ds-text transition-colors">
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-ds-text-3 w-12 text-center font-mono">
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => setScale(s => Math.min(2.5, s + 0.2))} className="p-1.5 rounded hover:bg-[#F1F5F9] text-ds-text-3 hover:text-ds-text transition-colors">
              <ZoomIn size={16} />
            </button>

            <div className="w-px h-5 mx-1" style={{ background: '#E2E8F0' }} />

            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="p-1.5 rounded hover:bg-[#F1F5F9] text-ds-text-3 hover:text-ds-text transition-colors disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-ds-text-2 w-20 text-center font-mono">
              {currentPage} / {numPages || '...'}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} className="p-1.5 rounded hover:bg-[#F1F5F9] text-ds-text-3 hover:text-ds-text transition-colors disabled:opacity-30">
              <ChevronRight size={16} />
            </button>

            <div className="w-px h-5 mx-1" style={{ background: '#E2E8F0' }} />

            <a href={fullUrl} download={fileName} className="p-1.5 rounded hover:bg-[#F1F5F9] text-ds-text-3 hover:text-ds-text transition-colors" title="Télécharger">
              <Download size={16} />
            </a>

            <button onClick={onClose} className="p-1.5 rounded hover:bg-red-500/10 text-ds-text-3 hover:text-red-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div ref={containerRef} className="flex-1 overflow-auto flex justify-center p-6" style={{ background: '#0A0E14' }}>
          {!isLoaded && (
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="animate-spin text-ds-cyan" />
              <p className="text-sm text-ds-text-2">Chargement du document...</p>
            </div>
          )}
          <Document
            file={fullUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading=""
            error={
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-red-400">Impossible de charger le PDF</p>
                <a href={fullUrl} download={fileName} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  <Download size={14} />
                  Télécharger le fichier
                </a>
              </div>
            }
          >
            <div ref={pageRef}>
              <Page
                pageNumber={currentPage}
                scale={scale}
                onRenderSuccess={onPageRenderSuccess}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-2xl"
              />
            </div>
          </Document>
        </div>
      </div>
    </div>
  )
}

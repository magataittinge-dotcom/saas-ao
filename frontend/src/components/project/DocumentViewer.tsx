import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Loader2, FileText, Image as ImageIcon } from 'lucide-react'
import { api } from '@/services/api'

export interface ViewableDocument {
  id: string
  name: string
  /** "project" = project doc (use /documents/{id}/preview), "vault" = coffre-fort doc */
  source: 'project'
}

interface Props {
  projectId: string
  documents: ViewableDocument[]
  initialIndex: number
  onClose: () => void
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
const PDF_EXTS = new Set(['.pdf'])

function getExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export default function DocumentViewer({ projectId, documents, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const prevBlobRef = useRef<string | null>(null)

  const doc = documents[index]
  const ext = doc ? getExt(doc.name) : ''
  const isPdf = PDF_EXTS.has(ext)
  const isImage = IMAGE_EXTS.has(ext)
  const hasPrev = index > 0
  const hasNext = index < documents.length - 1

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(() => setIndex((i) => Math.min(documents.length - 1, i + 1)), [documents.length])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Fetch document blob when index changes
  useEffect(() => {
    if (!doc) return

    // Revoke previous blob
    if (prevBlobRef.current) {
      URL.revokeObjectURL(prevBlobRef.current)
      prevBlobRef.current = null
    }

    setBlobUrl(null)
    setLoading(true)
    setError(false)

    let cancelled = false

    api.get(`/projects/${projectId}/documents/${doc.id}/preview`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        const url = URL.createObjectURL(res.data)
        prevBlobRef.current = url
        setBlobUrl(url)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [projectId, doc])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    if (!doc) return
    try {
      const res = await api.get(`/projects/${projectId}/documents/${doc.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }, [projectId, doc])

  if (!doc) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          width: '88vw',
          height: '92vh',
          background: '#0D1117',
          border: '1px solid rgba(34,211,238,0.12)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 50px rgba(34,211,238,0.06)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.10)', background: 'rgba(34,211,238,0.03)' }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Prev/Next document nav */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={goPrev}
                disabled={!hasPrev}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-20 text-ds-text-dim"
                title="Document précédent (←)"
              >
                <ChevronLeft size={18} />
              </button>
              <span
                className="text-xs w-14 text-center tabular-nums font-mono text-ds-text-2"
              >
                {index + 1}/{documents.length}
              </span>
              <button
                onClick={goNext}
                disabled={!hasNext}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-20 text-ds-text-dim"
                title="Document suivant (→)"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="w-px h-5 shrink-0" style={{ background: '#232730' }} />

            {/* File icon + name */}
            <div className="flex items-center gap-2 min-w-0">
              {isPdf ? (
                <FileText size={15} className="shrink-0 text-ds-danger" />
              ) : isImage ? (
                <ImageIcon size={15} className="shrink-0 text-ds-cyan" />
              ) : (
                <FileText size={15} className="shrink-0 text-ds-text-2" />
              )}
              <span className="text-sm font-medium truncate text-ds-text-1b">
                {doc.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg hover:bg-[#232730] transition-colors text-ds-text-dim"
              title="Télécharger"
            >
              <Download size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-ds-text-dim"
              title="Fermer (Echap)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto flex items-center justify-center" style={{ background: '#0A0E14' }}>
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-ds-accent" />
              <p className="text-sm text-ds-text-2">Chargement...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-4 text-center px-8">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(248,113,113,0.10)' }}
              >
                <FileText size={28} className="text-ds-danger" />
              </div>
              <p className="text-sm text-ds-danger-light">Impossible de charger le fichier</p>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg text-ds-accent"
                style={{ border: '1px solid rgba(34,211,238,0.30)' }}
              >
                <Download size={14} /> Télécharger à la place
              </button>
            </div>
          )}

          {!loading && !error && blobUrl && isPdf && (
            <iframe
              src={blobUrl}
              className="w-full h-full border-0"
              title={doc.name}
              style={{ background: '#fff' }}
            />
          )}

          {!loading && !error && blobUrl && isImage && (
            <div className="p-6 max-w-full max-h-full overflow-auto flex items-center justify-center">
              <img
                src={blobUrl}
                alt={doc.name}
                className="max-w-full max-h-[calc(92vh-60px)] object-contain rounded-lg shadow-2xl"
              />
            </div>
          )}

          {!loading && !error && blobUrl && !isPdf && !isImage && (
            <div className="flex flex-col items-center gap-5 text-center px-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.20)' }}
              >
                <FileText size={32} className="text-ds-accent" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ds-text-1b">{doc.name}</h3>
                <p className="text-sm mt-1 text-ds-text-2">
                  Apercu non disponible pour ce format ({ext.toUpperCase().replace('.', '')})
                </p>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors text-ds-accent"
                style={{
                  background: 'rgba(34,211,238,0.12)',
                  border: '1px solid rgba(34,211,238,0.25)',
                }}
              >
                <Download size={16} /> Télécharger le fichier
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, FileText, Search, Loader2, AlertCircle, Upload } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import type { ChecklistItem, Document } from '@/types'

const F = "'DM Sans', sans-serif"

interface Props {
  item: ChecklistItem
  onClose: () => void
  onLink: (doc: Document) => Promise<void>
  /** Téléverser un NOUVEAU fichier pour cette pièce (upload coffre + rattachement). */
  onUploadNew: (file: File) => Promise<void>
}

export default function VaultPickerModal({ item, onClose, onLink, onUploadNew }: Props) {
  const { data: documents = [], isLoading } = useDocuments()
  const [query, setQuery] = useState('')
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const required = item.document_type_required

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents
      .filter((d) => d.type === required || (required === 'autre' || !required))
      .filter((d) => !q || d.file_name.toLowerCase().includes(q))
  }, [documents, required, query])

  const others = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents
      .filter((d) => d.type !== required)
      .filter((d) => !q || d.file_name.toLowerCase().includes(q))
  }, [documents, required, query])

  const handleLink = async (doc: Document) => {
    setError(null)
    setLinking(doc.id)
    try {
      await onLink(doc)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Échec du rattachement'
      setError(msg)
    } finally {
      setLinking(null)
    }
  }

  const handleUpload = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      await onUploadNew(file)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Échec de l'import"
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  // Rendu en PORTAIL sur <body> : garantit un overlay plein écran au-dessus de
  // tout (la barre du bas est elle aussi portée) — sinon un ancêtre au contexte
  // d'empilement piège le `fixed` et le clic « Choisir » paraît sélectionner la page.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 select-none"
      style={{ background: 'rgba(15, 23, 42, 0.45)', fontFamily: F }}
      onClick={onClose}
    >
      <div
        className="bg-ds-bg rounded-lg w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
      >
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold" style={{ color: '#E7EAEE' }}>
              Choisir une pièce du coffre-fort
            </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#9AA3AE' }}>
              Pour : {item.details || item.document_type_required}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-ds-bg-2 shrink-0"
            aria-label="Fermer"
          >
            <X size={18} style={{ color: '#9AA3AE' }} />
          </button>
        </header>

        {/* Téléverser un nouveau fichier pour CETTE pièce */}
        <div className="px-6 pt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: '#22D3EE' }}
          >
            {uploading
              ? <><Loader2 size={15} className="animate-spin" /> Import…</>
              : <><Upload size={15} /> Téléverser un fichier depuis mon ordinateur</>}
          </button>
          <div className="flex items-center gap-3 my-3">
            <span className="flex-1 h-px" style={{ background: '#232730' }} />
            <span className="text-[11px] uppercase tracking-wider" style={{ color: '#6B7280' }}>ou choisir au coffre-fort</span>
            <span className="flex-1 h-px" style={{ background: '#232730' }} />
          </div>
        </div>

        {/* Search */}
        <div className="px-6">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Search size={14} style={{ color: '#6B7280' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom de fichier"
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: '#E7EAEE' }}
            />
          </div>
          {error && (
            <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#F87171' }}>
              <AlertCircle size={12} />
              {error}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin" style={{ color: '#22D3EE' }} />
            </div>
          ) : (
            <>
              <Group
                title={`Type recommandé (${required || 'autre'})`}
                docs={candidates}
                onLink={handleLink}
                linkingId={linking}
                emptyText="Aucun document de ce type dans votre coffre-fort."
              />
              {others.length > 0 && (
                <Group
                  title="Autres pièces"
                  docs={others}
                  onLink={handleLink}
                  linkingId={linking}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Group({
  title, docs, onLink, linkingId, emptyText,
}: {
  title: string
  docs: Document[]
  onLink: (doc: Document) => void
  linkingId: string | null
  emptyText?: string
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>
        {title}
      </h4>
      {docs.length === 0 ? (
        emptyText ? (
          <p className="text-xs py-2" style={{ color: '#6B7280' }}>{emptyText}</p>
        ) : null
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: '#121417' }}
            >
              <FileText size={16} style={{ color: '#9AA3AE' }} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#E7EAEE' }}>
                  {doc.file_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: '#6B7280' }}>{doc.type}</span>
                  <StatusPill status={doc.status} />
                </div>
              </div>
              <button
                type="button"
                disabled={linkingId !== null}
                onClick={() => onLink(doc)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 shrink-0"
                style={{ background: '#22D3EE' }}
              >
                {linkingId === doc.id
                  ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Liaison...</span>
                  : 'Choisir'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: Document['status'] }) {
  const cfg =
    status === 'expired'
      ? { label: 'Expiré', color: '#F87171', bg: '#3A1D1D' }
      : status === 'expiring_soon'
      ? { label: 'Expire bientôt', color: '#9AA3AE', bg: '#232730' }
      : { label: 'Valide', color: '#34D399', bg: '#0F3527' }
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

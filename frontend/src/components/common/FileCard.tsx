import { FileText, Trash2, ExternalLink, Tag, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { DOC_TYPE_LABELS } from '@/lib/vault'
import { getSignedFileUrl } from '@/services/api'
import { StatusBadge, documentStatusBadge } from './StatusBadge'
import type { Document } from '@/types'

interface Props {
  document: Document
  onDelete?: (id: string) => void
  onEdit?: (document: Document) => void
}

export function FileCard({ document, onDelete, onEdit }: Props) {
  const badge = documentStatusBadge(document.status)
  const isUnclassified = document.status === 'unclassified'

  const openFile = async () => {
    try {
      const url = await getSignedFileUrl(document.file_url)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('[FileCard] impossible d’obtenir le lien signé:', err)
    }
  }

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border transition-all duration-150 hover:border-[rgba(228,233,242,0.20)]"
      style={{ background: 'rgba(248,250,252,1)', borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="p-2 rounded-md shrink-0"
          style={{ background: 'rgba(228,233,242,0.10)' }}
        >
          <FileText size={18} style={{ color: '#E4E9F2' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ds-text truncate">
            {isUnclassified ? document.file_name : (DOC_TYPE_LABELS[document.type] ?? document.type)}
          </p>
          {!isUnclassified && (
            <p className="text-xs text-ds-text-2 truncate">{document.file_name}</p>
          )}
          {document.expiry_date && (
            <p className="text-xs text-ds-text-3">
              Expire le {formatDate(document.expiry_date)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <StatusBadge label={badge.label} variant={badge.variant} />
        {onEdit && (
          isUnclassified ? (
            <button
              onClick={() => onEdit(document)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors"
              style={{ color: '#E4E9F2', background: 'rgba(228,233,242,0.10)' }}
            >
              <Tag size={12} /> Classer
            </button>
          ) : (
            <button
              onClick={() => onEdit(document)}
              title="Modifier (catégorie, type, dates)"
              className="p-1.5 text-ds-text-3 hover:text-ds-text rounded transition-colors"
            >
              <Pencil size={14} />
            </button>
          )
        )}
        <button
          onClick={openFile}
          title="Ouvrir le document"
          className="p-1.5 text-ds-text-3 hover:text-ds-text rounded transition-colors"
        >
          <ExternalLink size={14} />
        </button>
        {onDelete && (
          <button
            onClick={() => onDelete(document.id)}
            className="p-1.5 text-ds-text-3 hover:text-ds-danger rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

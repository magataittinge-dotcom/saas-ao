import { FileText, Trash2, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { getSignedFileUrl } from '@/services/api'
import { StatusBadge, documentStatusBadge } from './StatusBadge'
import type { Document } from '@/types'

interface Props {
  document: Document
  onDelete?: (id: string) => void
}

const docTypeLabels: Record<string, string> = {
  urssaf: 'Attestation URSSAF', kbis: 'KBIS', decennale: 'Décennale',
  rc_civile: 'RC Civile', qualibat: 'Qualibat RGE', pro_btp: 'PRO BTP',
  cibtp: 'CIBTP', fiscal: 'Attestation fiscale', dc1: 'DC1', dc2: 'DC2',
  rib: 'RIB', caces: 'CACES', amiante_ss4: 'Amiante SS4',
  declaration_honneur: "Déclaration sur l'honneur", pouvoir: 'Pouvoir habilité',
  organigramme_doc: 'Organigramme', chiffre_affaires: "Chiffre d'affaires",
  effectifs: 'Effectifs', autre: 'Autre',
}

export function FileCard({ document, onDelete }: Props) {
  const badge = documentStatusBadge(document.status)

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
      className="flex items-center justify-between p-3 rounded-lg border transition-all duration-150 hover:border-sky-500/20"
      style={{ background: 'rgba(248,250,252,1)', borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="p-2 rounded-md shrink-0"
          style={{ background: 'rgba(14,165,233,0.10)' }}
        >
          <FileText size={18} style={{ color: '#0EA5E9' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ds-text truncate">
            {docTypeLabels[document.type] ?? document.type}
          </p>
          <p className="text-xs text-ds-text-2 truncate">{document.file_name}</p>
          {document.expiry_date && (
            <p className="text-xs text-ds-text-3">
              Expire le {formatDate(document.expiry_date)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <StatusBadge label={badge.label} variant={badge.variant} />
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

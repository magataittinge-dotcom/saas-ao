import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useUpdateDocument } from '@/hooks/useDocuments'
import {
  CATEGORY_TYPES, DOC_TYPE_LABELS, VAULT_CATEGORY_LABELS, VAULT_CATEGORY_ORDER,
} from '@/lib/vault'
import type { Document, DocumentType, VaultCategory } from '@/types'

interface Props {
  document: Document
  onClose: () => void
}

const inputClass =
  'w-full rounded-lg border px-3 py-2 text-sm bg-ds-bg text-[#E7EAEE] focus:outline-none focus:ring-2 focus:ring-sky-200'
const inputStyle = { borderColor: '#232730' }

/**
 * Classement / modification manuelle d'un document du coffre-fort
 * (catégorie → type → dates). Le statut est recalculé côté backend :
 * type + date → valide ; type sans date → « à vérifier » ; jamais
 * « valide » par défaut.
 */
export default function ClassifyDocumentModal({ document: doc, onClose }: Props) {
  const isUnclassified = doc.category === 'unclassified'
  const [category, setCategory] = useState<Exclude<VaultCategory, 'unclassified'>>(
    isUnclassified ? 'attestations_sociales_fiscales' : (doc.category as Exclude<VaultCategory, 'unclassified'>),
  )
  const [type, setType] = useState<DocumentType>(
    isUnclassified ? CATEGORY_TYPES['attestations_sociales_fiscales'][0] : doc.type,
  )
  const [issuedDate, setIssuedDate] = useState(doc.issued_date ?? '')
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date ?? '')
  const { mutate: updateDocument, isPending, error } = useUpdateDocument()

  const onCategoryChange = (cat: Exclude<VaultCategory, 'unclassified'>) => {
    setCategory(cat)
    setType(CATEGORY_TYPES[cat][0])
  }

  const onSubmit = () => {
    updateDocument(
      {
        id: doc.id,
        payload: {
          type,
          category,
          ...(issuedDate ? { issued_date: issuedDate } : {}),
          ...(expiryDate ? { expiry_date: expiryDate } : {}),
        },
      },
      { onSuccess: onClose },
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.40)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ds-bg p-5 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#E7EAEE]">
              {isUnclassified ? 'Classer le document' : 'Modifier le document'}
            </h2>
            <p className="text-xs text-[#6B7280] truncate">{doc.file_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#232730]" style={{ color: '#6B7280' }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#9AA3AE] mb-1">Catégorie</label>
            <select
              className={inputClass} style={inputStyle}
              value={category}
              onChange={(e) => onCategoryChange(e.target.value as Exclude<VaultCategory, 'unclassified'>)}
            >
              {VAULT_CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>{VAULT_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9AA3AE] mb-1">Type de document</label>
            <select
              className={inputClass} style={inputStyle}
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
            >
              {CATEGORY_TYPES[category].map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#9AA3AE] mb-1">Date d'émission</label>
              <input type="date" className={inputClass} style={inputStyle}
                value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9AA3AE] mb-1">Valide jusqu'au</label>
              <input type="date" className={inputClass} style={inputStyle}
                value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          {!expiryDate && type !== 'autre' && (
            <p className="text-xs" style={{ color: '#FBBF24' }}>
              Sans date de validité, le document restera « ⚠️ À vérifier ».
            </p>
          )}
          {error && (
            <p className="text-xs" style={{ color: '#F87171' }}>
              Enregistrement impossible — réessayez.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#232730]"
            style={{ color: '#9AA3AE' }}>
            Annuler
          </button>
          <button onClick={onSubmit} disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#22D3EE' }}>
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    window.document.body,
  )
}

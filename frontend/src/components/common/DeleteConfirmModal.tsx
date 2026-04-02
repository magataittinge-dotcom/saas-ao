import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

interface Props {
  title?: string
  message?: string
  confirmText?: string
  projectName?: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export default function DeleteConfirmModal({ title = 'Supprimer cet appel d\'offres ?', message = 'Cette action est irréversible.', onConfirm, onCancel }: Props) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onCancel() }}
    >
      <div
        className="rounded-xl p-6 max-w-sm w-full mx-4 space-y-4"
        style={{
          background: '#0D1117',
          border: '1px solid rgba(239,68,68,0.20)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              <AlertTriangle size={20} style={{ color: '#F87171' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ds-text">{title}</h3>
              <p className="text-xs text-ds-text-3 mt-0.5">{message}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="p-1 text-ds-text-3 hover:text-ds-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-ds-text-2 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
            style={{ background: 'rgba(239,68,68,0.80)' }}
          >
            {isDeleting ? (
              <><Loader2 size={14} className="animate-spin" /> Suppression...</>
            ) : (
              'Supprimer'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

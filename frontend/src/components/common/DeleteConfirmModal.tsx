import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmText?: string
  projectName: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export default function DeleteConfirmModal({ title, message, confirmText = 'SUPPRIMER', projectName, onConfirm, onCancel }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const canDelete = inputValue === confirmText

  const handleConfirm = async () => {
    if (!canDelete) return
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
        className="rounded-xl p-6 max-w-md w-full mx-4 space-y-4"
        style={{
          background: '#0D1117',
          border: '1px solid rgba(239,68,68,0.20)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.08)'
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
            <h3 className="text-lg font-semibold text-ds-text">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="p-1 text-ds-text-3 hover:text-ds-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <div>
          <p className="text-sm text-ds-text-2">{message}</p>
          <div
            className="mt-3 rounded-lg px-3 py-2"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
          >
            <p className="text-sm font-medium" style={{ color: '#F87171' }}>{projectName}</p>
          </div>
        </div>

        {/* Confirmation input */}
        <div>
          <p className="text-xs text-ds-text-3 mb-2">
            Tapez <span className="font-bold text-red-400">{confirmText}</span> pour confirmer :
          </p>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            placeholder={confirmText}
            disabled={isDeleting}
            className="glass-input w-full py-2.5 text-sm w-full text-sm"
            style={{
              borderColor: canDelete ? 'rgba(239,68,68,0.40)' : undefined,
            }}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && canDelete) handleConfirm() }}
          />
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
            disabled={!canDelete || isDeleting}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
            style={{
              background: canDelete ? 'rgba(239,68,68,0.80)' : 'rgba(239,68,68,0.20)',
              cursor: canDelete ? 'pointer' : 'not-allowed',
              opacity: canDelete ? 1 : 0.5,
            }}
          >
            {isDeleting ? (
              <><Loader2 size={14} className="animate-spin" /> Suppression...</>
            ) : (
              <><AlertTriangle size={14} /> Supprimer définitivement</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

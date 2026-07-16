import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  title?: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export default function DeleteConfirmModal({
  title = "Supprimer cet appel d'offres ?",
  onConfirm,
  onCancel,
}: Props) {
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
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onCancel() }}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 space-y-5"
        style={{
          background: 'rgba(0,0,0,0.30)',
          backdropFilter: 'none',
          border: '1px solid rgba(186,205,234,.13)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        <h3 className="text-base font-semibold text-center" style={{ color: '#F4F6FA' }}>
          {title}
        </h3>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(186,205,234,.13)', color: '#9BA4B5', border: '1px solid rgba(186,205,234,.13)' }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
            style={{ background: '#F58E86' }}
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

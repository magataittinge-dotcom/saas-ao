import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { messageErreur } from '@/lib/erreurs'

interface Props {
  /** Ce qui sera supprimé, nommé : « Supprimer « CCTP_lot05.pdf » ? » (1.13). */
  title?: string
  /** Précision facultative sous le titre. */
  detail?: string
  libelleConfirmer?: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** Le contenu de la fenêtre, sans portail (rendu testable). */
export function DeleteConfirmContenu({
  title, detail, libelleConfirmer, enCours, erreur, onConfirmer, onCancel,
}: {
  title: string
  detail?: string
  libelleConfirmer: string
  enCours: boolean
  erreur: string | null
  onConfirmer: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-suppression-titre"
      className="rounded-2xl p-6 max-w-sm w-full mx-4 space-y-5"
      style={{
        background: '#121519',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div className="space-y-2 text-center">
        <h3 id="confirmation-suppression-titre" className="text-base font-semibold" style={{ color: '#F4F6FA' }}>
          {title}
        </h3>
        {detail && <p className="text-sm" style={{ color: '#9BA4B5' }}>{detail}</p>}
        {erreur && <p role="alert" className="text-sm" style={{ color: '#F5C26B' }}>{erreur}</p>}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={enCours}
          autoFocus
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: '#1C222D', color: '#E8EBF2', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Annuler
        </button>
        <button
          onClick={onConfirmer}
          disabled={enCours}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          style={{ background: 'rgba(245,142,134,0.14)', color: '#F58E86', boxShadow: 'inset 0 0 0 1px rgba(245,142,134,0.30)' }}
        >
          {enCours ? (
            <><Loader2 size={14} className="animate-spin" /> Suppression…</>
          ) : (
            libelleConfirmer
          )}
        </button>
      </div>
    </div>
  )
}

export default function DeleteConfirmModal({
  title = "Supprimer cet appel d'offres ?",
  detail,
  libelleConfirmer = 'Supprimer',
  onConfirm,
  onCancel,
}: Props) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Échap ferme la fenêtre (sauf pendant la suppression).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isDeleting) onCancel() }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [isDeleting, onCancel])

  const handleConfirm = async () => {
    setIsDeleting(true)
    setErreur(null)
    try {
      await onConfirm()
    } catch (err) {
      setErreur(await messageErreur(err, "La suppression n'a pas abouti. Réessayez."))
    } finally {
      setIsDeleting(false)
    }
  }

  // Portail : un ancêtre animé (transform) piégerait le « fixed » dans la page.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onCancel() }}
    >
      <DeleteConfirmContenu
        title={title}
        detail={detail}
        libelleConfirmer={libelleConfirmer}
        enCours={isDeleting}
        erreur={erreur}
        onConfirmer={() => { void handleConfirm() }}
        onCancel={onCancel}
      />
    </div>,
    document.body,
  )
}

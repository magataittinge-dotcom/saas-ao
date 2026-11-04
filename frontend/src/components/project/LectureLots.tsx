import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { AlertCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { detailConfirmationLecture, libelleBoutonLire, titreConfirmationLecture } from '@/lib/coutLecture'

/**
 * Le bouton « Lire N lots (N unités) » : l'unité est écrite dessus (G1). En-tête : le bouton en dégradé de l'écran
 * (`signature`) ; barre du bas : le même geste en bleu uni (`default`), un seul dégradé par écran.
 */
export function BoutonLireDossier({ nbLots, illimite, disabled, onClick, variante = 'signature' }: {
  nbLots: number
  illimite: boolean
  disabled?: boolean
  onClick: () => void
  variante?: 'signature' | 'default'
}) {
  return (
    <Button type="button" variant={variante} onClick={onClick} disabled={disabled}>
      <Sparkles size={16} aria-hidden />
      <span>{libelleBoutonLire(nbLots, illimite)}</span>
    </Button>
  )
}

/** L'erreur de la lecture, sous le bouton qui l'a lancée, dans la vue (G2). `alerte={false}` : la répétition de la barre du bas. */
export function ErreurLecture({ message, className, alerte = true }: { message: string; className?: string; alerte?: boolean }) {
  return (
    <p
      role={alerte ? 'alert' : undefined}
      className={`flex items-start gap-2 text-sm ${className ?? ''}`}
      style={{ color: 'var(--danger-fg)' }}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  )
}

/** Le contenu de la confirmation, sans portail (rendu testable). */
export function ConfirmationLectureContenu({ nbLots, illimite, onConfirmer, onAnnuler }: {
  nbLots: number
  illimite: boolean
  onConfirmer: () => void
  onAnnuler: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-lecture-titre"
      className="mx-4 w-full max-w-sm space-y-5 rounded-2xl p-6"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-pop)' }}
    >
      <div className="space-y-2 text-center">
        <h3 id="confirmation-lecture-titre" className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
          {titreConfirmationLecture(nbLots, illimite)}
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{detailConfirmationLecture(illimite)}</p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAnnuler}
          autoFocus
          className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{ background: 'var(--surface-1)', color: 'var(--text-1)', border: '1px solid var(--border-1)' }}
        >
          Annuler
        </button>
        <button type="button" onClick={onConfirmer} className="signature-btn flex-1 justify-center whitespace-nowrap">
          Lire {nbLots} lots
        </button>
      </div>
    </div>
  )
}

/** « Lire N lots = N unités » : demandée avant l'appel dès que plus d'un lot est choisi. Échap annule. */
export default function ConfirmationLecture(props: { nbLots: number; illimite: boolean; onConfirmer: () => void; onAnnuler: () => void }) {
  const { onAnnuler } = props
  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnnuler() }
    document.addEventListener('keydown', echap)
    return () => document.removeEventListener('keydown', echap)
  }, [onAnnuler])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}>
      <ConfirmationLectureContenu {...props} />
    </div>,
    document.body,
  )
}

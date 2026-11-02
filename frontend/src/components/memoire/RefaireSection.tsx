import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export interface CibleRefaire {
  part: string
  cle: string
  titre: string
}

/** Le petit bouton à côté du titre d'une partie. */
export function BoutonRefaire({
  titre, onClick, desactive = false,
}: {
  titre: string
  onClick: () => void
  desactive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-label={`Refaire cette partie : ${titre}`}
      className="memoire-refaire inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-ds-bg-2 disabled:opacity-50 disabled:pointer-events-none [@media(pointer:coarse)]:min-h-11"
      style={{ color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
    >
      <RefreshCw size={12} aria-hidden="true" /> Refaire cette partie
    </button>
  )
}

/** Le texte de la confirmation : ce qui va se passer, ce qui ne change pas. Aucun montant : l'abonnement se compte en
 *  unités, et « Refaire cette partie » n'en décompte aucune. */
export function CorpsConfirmationRefaire({ titre }: { titre: string }) {
  return (
    <div className="space-y-2 text-sm" style={{ color: 'var(--text-2)' }}>
      <p>
        Synorix IA réécrit « {titre} » à partir de votre dossier et de la fiche de cette partie. Le reste du mémoire ne
        change pas ; le texte actuel de cette partie est remplacé.
      </p>
      <p className="font-semibold" style={{ color: 'var(--text-1)' }}>Ne décompte aucune unité.</p>
    </div>
  )
}

/** La confirmation avant de refaire une partie. */
export default function ConfirmationRefaire({
  cible, enCours, onConfirmer, onAnnuler,
}: {
  cible: CibleRefaire
  enCours: boolean
  onConfirmer: () => void
  onAnnuler: () => void
}) {
  return (
    <Dialog open onOpenChange={(ouvert) => { if (!ouvert && !enCours) onAnnuler() }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base font-bold text-fg">Refaire cette partie ?</DialogTitle>
          <DialogDescription className="sr-only">Confirmer la réécriture de la partie {cible.titre}</DialogDescription>
        </DialogHeader>
        <CorpsConfirmationRefaire titre={cible.titre} />
        <DialogFooter className="gap-2 pt-2 sm:space-x-0">
          <Button variant="ghost" onClick={onAnnuler} disabled={enCours}>Annuler</Button>
          <Button onClick={onConfirmer} disabled={enCours}>
            {enCours ? 'Lancement…' : 'Refaire cette partie'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

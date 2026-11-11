import { RefreshCw } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { DialogueConfirmation } from '@/components/ui/dialogue'

export interface CibleRefaire {
  part: string
  cle: string
  titre: string
}

/** Le geste à côté du titre d'une partie : un bouton discret du système, en mots. */
export function BoutonRefaire({
  titre, onClick, desactive = false,
}: {
  titre: string
  onClick: () => void
  desactive?: boolean
}) {
  return (
    <Bouton variante="discret" onClick={onClick} disabled={desactive} aria-label={`Refaire cette partie : ${titre}`} className="memoire-refaire px-2.5">
      <RefreshCw aria-hidden="true" /> Refaire cette partie
    </Bouton>
  )
}

/** Le texte de la confirmation : ce qui va se passer, ce qui ne change pas. Aucun montant : l'abonnement se compte en
 *  unités, et « Refaire cette partie » n'en décompte aucune. */
export function CorpsConfirmationRefaire({ titre }: { titre: string }) {
  return (
    <div className="space-y-2 text-sm text-fg-2">
      {/* Jury, tour 1 : la conséquence d'abord, à l'encre du texte ; ce qui rassure ensuite, sans gras. */}
      <p className="text-pretty font-medium text-fg">
        Le texte actuel de «&nbsp;{titre}&nbsp;» est remplacé par une nouvelle rédaction, faite à partir de votre dossier et de la fiche de cette partie.
      </p>
      <p className="text-pretty">Le reste du mémoire ne change pas. Ne décompte aucune unité.</p>
    </div>
  )
}

/** La confirmation avant de refaire une partie : le dialogue du système. */
export default function ConfirmationRefaire({
  cible, enCours, onConfirmer, onAnnuler,
}: {
  cible: CibleRefaire
  enCours: boolean
  onConfirmer: () => void
  onAnnuler: () => void
}) {
  return (
    <DialogueConfirmation
      ouvert
      onOuvert={(ouvert) => { if (!ouvert) onAnnuler() }}
      titre="Refaire cette partie ?"
      libelleConfirmer="Refaire cette partie"
      libelleEnCours="Lancement…"
      enCours={enCours}
      onConfirmer={onConfirmer}
    >
      <CorpsConfirmationRefaire titre={cible.titre} />
    </DialogueConfirmation>
  )
}

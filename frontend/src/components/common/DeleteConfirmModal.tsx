import { useState } from 'react'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { DialogueConfirmation } from '@/components/ui/dialogue'

interface Props {
  /** Ce qui sera supprimé, nommé : « Supprimer « CCTP_lot05.pdf » ? » (1.13). */
  title?: string
  /** Précision facultative sous le titre. */
  detail?: string
  libelleConfirmer?: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** Le contenu de la confirmation, sans portail (rendu testable) : la question, la conséquence, « Annuler » et le verbe. */
export function DeleteConfirmContenu({ title, detail, libelleConfirmer, enCours, erreur, onConfirmer, onCancel }: {
  title: string
  detail?: string
  libelleConfirmer: string
  enCours: boolean
  erreur: string | null
  onConfirmer: () => void
  onCancel: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirmation-suppression-titre" className="grid w-full max-w-md gap-4 rounded-carte border border-bord bg-surface-pop p-6 text-fg shadow-flottant">
      <div className="grid gap-1.5">
        <h3 id="confirmation-suppression-titre" className="text-lg font-semibold">{title}</h3>
        {detail && <p className="text-sm text-fg-2">{detail}</p>}
        {erreur && <p role="alert" className="text-sm font-medium text-rouge-ink">{erreur}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Bouton variante="secondaire" onClick={onCancel} disabled={enCours}>Annuler</Bouton>
        <Bouton variante="danger" onClick={onConfirmer} enCours={enCours} libelleEnCours="Suppression…">{libelleConfirmer}</Bouton>
      </div>
    </div>
  )
}

/**
 * ALIAS MINCE. La confirmation de suppression est le `DialogueConfirmation` du système (components/ui/dialogue.tsx), en
 * variante « danger » : Échap, clic sur le voile, piège et retour du focus fournis par Radix. Monté = ouvert.
 */
export default function DeleteConfirmModal({ title = "Supprimer cet appel d’offres ?", detail, libelleConfirmer = 'Supprimer', onConfirm, onCancel }: Props) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const confirmer = async () => {
    setEnCours(true)
    setErreur(null)
    try { await onConfirm() }
    catch (err) { setErreur(await messageErreur(err, "La suppression n’a pas abouti. Réessayez.")) }
    finally { setEnCours(false) }
  }
  return (
    <DialogueConfirmation ouvert onOuvert={(o) => { if (!o) onCancel() }} titre={title} description={detail} danger
      libelleConfirmer={libelleConfirmer} libelleEnCours="Suppression…" enCours={enCours} erreur={erreur} onConfirmer={() => { void confirmer() }} />
  )
}

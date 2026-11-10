import { DialogueConfirmation } from '@/components/ui/dialogue'
import { detailConfirmationLecture, titreConfirmationLecture } from '@/lib/coutLecture'

/**
 * « Lire N lots = N unités » (G1) : la confirmation demandée avant l'appel dès que plus d'un lot est choisi, parce que
 * plusieurs unités partent d'un coup. C'est le dialogue du système (piège de focus, Échap, « Annuler » à gauche) : le titre dit
 * ce que la lecture décompte, le bouton qui confirme dit le geste (« Lire les 3 lots »), il ne répète pas le titre mot pour mot.
 */
export default function ConfirmationLecture({ ouvert, onOuvert, nbLots, illimite, onConfirmer }: {
  ouvert: boolean
  onOuvert: (ouvert: boolean) => void
  nbLots: number
  illimite: boolean
  onConfirmer: () => void
}) {
  return (
    <DialogueConfirmation
      ouvert={ouvert}
      onOuvert={onOuvert}
      titre={titreConfirmationLecture(nbLots, illimite)}
      description={detailConfirmationLecture(illimite)}
      libelleConfirmer={`Analyser les ${nbLots} lots`}
      onConfirmer={onConfirmer}
    />
  )
}

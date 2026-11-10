import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { libelleUnites } from '@/lib/lotsMetiers'
import { phraseLotsEcartes, type LotsEcartes } from '@/lib/lotsSource'
import type { LotUnique } from '@/lib/lotUnique'

/**
 * Sur l'écran de dépôt, un dossier à un seul lot (ou à marché unique) : l'écran Lots est sauté, mais rien ne part seul.
 * La lecture décompte une unité d'abonnement et ne démarre qu'au clic sur « Lire ce dossier », l'action principale de
 * l'écran (en-tête, A7) : cette carte dit ce qui va être lu et ce que cela décompte, elle ne répète pas le bouton. Un lien
 * discret ouvre quand même l'écran des lots (pour en ajouter un à la main).
 */
export default function CarteLotUnique({ lot, ecartes, onOuvrirLots }: {
  lot: LotUnique
  ecartes: Partial<LotsEcartes> | null | undefined
  onOuvrirLots: () => void
}) {
  const ecartesPhrase = phraseLotsEcartes(ecartes)
  return (
    <Carte data-lot-unique="">
      <p className="break-words text-base font-semibold text-fg">
        {lot.marcheUnique ? 'Ce dossier n’a pas de lots : ' : 'Ce dossier a un seul lot : '}{lot.designation}
      </p>
      <p className="mt-1 text-sm text-fg-2">
        Aucun écran de choix à passer. «&nbsp;Lire ce dossier&nbsp;» relève chaque exigence avec sa source ; la lecture décompte {libelleUnites(1)} de votre abonnement et ne démarre qu’au clic.
      </p>
      {ecartesPhrase && <p className="mt-1 text-sm text-fg-2">{ecartesPhrase}</p>}
      <Bouton variante="lien" className="mt-3" onClick={onOuvrirLots}>Ouvrir l’écran des lots</Bouton>
    </Carte>
  )
}

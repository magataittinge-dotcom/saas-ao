import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { libelleUnites } from '@/lib/lotsMetiers'
import { phraseLotsEcartes, type LotsEcartes } from '@/lib/lotsSource'
import type { LotUnique } from '@/lib/lotUnique'

/**
 * Sur l'écran de dépôt, un dossier à un seul lot (ou à marché unique) : l'écran Lots est sauté, mais rien ne part seul.
 * La lecture décompte une unité d'abonnement et ne démarre qu'au clic sur le bouton ; un lien discret ouvre quand même
 * l'écran des lots (pour en ajouter un à la main).
 */
export default function CarteLotUnique({ lot, ecartes, enCours, onLire, onOuvrirLots }: {
  lot: LotUnique
  ecartes: Partial<LotsEcartes> | null | undefined
  enCours: boolean
  onLire: () => void
  onOuvrirLots: () => void
}) {
  const ecartesPhrase = phraseLotsEcartes(ecartes)
  return (
    <div data-lot-unique="" className="rounded-carte border border-bord-2 bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <p className="break-words text-base font-semibold text-fg">
            {lot.marcheUnique ? 'Ce dossier n’a pas de lots : ' : 'Ce dossier a un seul lot : '}{lot.designation}
          </p>
          <p className="mt-1 text-sm text-fg-2">
            Aucun écran de choix à passer. La lecture relève chaque exigence avec sa source ; elle décompte {libelleUnites(1)} de votre abonnement et ne démarre qu’au clic.
          </p>
          {ecartesPhrase && <p className="mt-1 text-sm text-fg-2">{ecartesPhrase}</p>}
        </div>
        <Button type="button" variant="signature" onClick={onLire} disabled={enCours}>
          <Sparkles size={16} aria-hidden />
          Lire ce dossier ({libelleUnites(1)})
        </Button>
      </div>
      <button
        type="button"
        onClick={onOuvrirLots}
        className="mt-3 inline-flex min-h-9 items-center text-sm font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11"
      >
        Ouvrir l’écran des lots
      </button>
    </div>
  )
}

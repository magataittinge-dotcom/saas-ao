import { CircleHelp } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'

/**
 * Sous une partie du plan : elle sert le même sous-critère qu'une partie plus haut et porte un titre proche. Le lien fait ce que
 * fait « Retirer du plan » du menu de la rangée ; rien n'est retiré sans ce clic.
 */
export default function MentionRecoupe({ titre, onRetirer }: { titre: string; onRetirer: () => void }) {
  return (
    <p data-recoupe="" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
      <span className="inline-flex items-center gap-1.5 font-medium text-ambre-ink">
        <CircleHelp size={14} aria-hidden className="shrink-0" />
        Se recoupe avec «&nbsp;{titre}&nbsp;»
      </span>
      <Bouton variante="lien" onClick={onRetirer}>Retirer cette partie</Bouton>
    </p>
  )
}

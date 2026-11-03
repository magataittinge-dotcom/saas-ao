import { CircleHelp } from 'lucide-react'

/**
 * Sous une partie du plan : elle sert le même sous-critère qu'une partie plus haut et porte un titre proche. Le lien fait ce que
 * fait la croix « retirer » de la carte ; rien n'est retiré sans ce clic.
 */
export default function MentionRecoupe({ titre, onRetirer }: { titre: string; onRetirer: () => void }) {
  return (
    <p data-recoupe="" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
      <span className="inline-flex items-center gap-1.5 font-medium text-ambre-ink">
        <CircleHelp size={14} aria-hidden />
        Se recoupe avec «&nbsp;{titre}&nbsp;»
      </span>
      <button
        type="button" onClick={onRetirer}
        className="inline-flex min-h-9 items-center rounded-xs font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11"
      >
        Retirer cette partie
      </button>
    </p>
  )
}

import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Puce de filtre, à deux états (VEILLE-DESIGN P1, P14) :
 *  - proposée : « + Métier » (trait de champ, texte secondaire) ;
 *  - active : elle porte sa valeur et sa croix (« Métier : Gros œuvre ✕ »), fond `--bleu-soft`, texte `--bleu-ink`, trait
 *    `--bleu-mark`. Une sélection n'est JAMAIS un aplat d'accent.
 * Le libellé d'un filtre est le nom de la colonne qu'il filtre. 44 px de haut, en pilule.
 */
export function PuceFiltre({ libelle, valeur, onOuvrir, onRetirer, className }: {
  libelle: string
  /** La valeur choisie ; absente = la puce est proposée. */
  valeur?: string | null
  onOuvrir: () => void
  onRetirer?: () => void
  className?: string
}) {
  const base = 'inline-flex min-h-11 items-center rounded-pilule border text-sm font-medium transition-colors duration-fast ease-survol'
  if (!valeur) {
    return (
      <button type="button" onClick={onOuvrir} data-filtre="propose" className={cn(base, 'gap-1.5 border-bord-champ bg-surface-0 pl-3 pr-4 text-fg-2 hover:bg-surface-1 hover:text-fg active:scale-[.98]', className)}>
        <Plus aria-hidden size={16} strokeWidth={1.5} />{libelle}
      </button>
    )
  }
  return (
    <span data-filtre="actif" className={cn(base, 'border-bleu-mark bg-bleu-soft text-bleu-ink', className)}>
      <button type="button" onClick={onOuvrir} className="min-h-11 rounded-l-pilule pl-4 pr-1.5 text-left hover:underline">
        <span className="font-normal">{libelle} : </span>{valeur}
      </button>
      {onRetirer && (
        <button type="button" onClick={onRetirer} aria-label={`Retirer le filtre ${libelle}`} className="grid size-11 place-items-center rounded-r-pilule hover:bg-bleu-soft active:scale-[.98]">
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>
      )}
    </span>
  )
}

/** « Effacer les filtres » : en fin de rangée, seulement si un filtre est actif. */
export function EffacerFiltres({ actifs, onEffacer }: { actifs: number; onEffacer: () => void }) {
  if (actifs <= 0) return null
  return <button type="button" onClick={onEffacer} className="min-h-11 rounded px-2 text-sm font-medium text-accent-text underline-offset-4 hover:underline">Effacer les filtres</button>
}

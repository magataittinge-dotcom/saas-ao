import type { ChecklistItem } from '@/types'
import { MenuLigne } from '@/components/etape'

// « Non concerné » (B2 §7 n°8) : une pièce conditionnelle (DC4 « le cas
// échéant », habilitation « si groupement »…) que l'entreprise écarte. Persisté
// et journalisé par le serveur (POST /checklist/{id}/non-concerne), réversible,
// et hors des comptes — comme dans le score du serveur.

export function estNonConcernee(item: Pick<ChecklistItem, 'status'>): boolean {
  return item.status === 'non_applicable'
}

/** Pièces comptées : une pièce « Non concerné » sort des comptes. */
export function piecesComptees<T extends Pick<ChecklistItem, 'status'>>(items: T[]): T[] {
  return items.filter((i) => !estNonConcernee(i))
}

/**
 * Le geste « Non concerné » : sur une ligne concernée il vit dans le menu « … » (il ne s'affiche pas sur chaque ligne) ;
 * sur une ligne écartée, « Je suis concerné » reste visible pour reprendre la pièce.
 */
export default function NonConcerneBouton({
  item, onNonConcerne,
}: {
  item: ChecklistItem
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
}) {
  if (!onNonConcerne) return null
  if (estNonConcernee(item)) {
    return (
      <button
        type="button"
        onClick={() => { void onNonConcerne(item, false) }}
        className="inline-flex min-h-9 shrink-0 items-center rounded-xs text-sm font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11"
      >
        Je suis concerné
      </button>
    )
  }
  return (
    <MenuLigne libelle="Autres actions pour cette pièce">
      {(fermer) => (
        <button
          type="button"
          role="menuitem"
          onClick={() => { fermer(); void onNonConcerne(item, true) }}
          className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-2"
        >
          Non concerné
        </button>
      )}
    </MenuLigne>
  )
}

import type { ReactNode } from 'react'
import type { ChecklistItem } from '@/types'
import { Bouton } from '@/components/ui/bouton'
import { MenuElement, MenuPoints } from '@/components/ui/menu'

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
  item, onNonConcerne, children,
}: {
  item: ChecklistItem
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
  /** Les autres gestes rares de la ligne (« Voir dans le dossier »…) : un menu à une seule entrée est un bouton caché. */
  children?: ReactNode
}) {
  if (!onNonConcerne) return null
  if (estNonConcernee(item)) {
    return <Bouton variante="lien" className="shrink-0" onClick={() => { void onNonConcerne(item, false) }}>Je suis concerné</Bouton>
  }
  return (
    <MenuPoints libelle="Autres actions pour cette pièce">
      {children}
      <MenuElement onSelect={() => { void onNonConcerne(item, true) }}>Non concerné pour cette pièce</MenuElement>
    </MenuPoints>
  )
}

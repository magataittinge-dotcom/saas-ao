import * as React from 'react'

type GestionnaireFocus = ((evenement: Event) => void) | undefined

/**
 * Le focus revient à ce qui a ouvert (restes 2). Radix ne rend le focus qu'à son `Trigger` : un dialogue, une palette ou un
 * tiroir ouvert par un état (« Supprimer mon compte », la recherche de la barre, Ctrl K) le laissait sur `<body>` à la
 * fermeture, et le clavier repartait du haut de la page. On retient l'élément qui avait le focus à l'ouverture et on le lui
 * rend à la fermeture. Sans élément retenu (Safari ne donne pas le focus à un bouton cliqué) ou s'il a quitté la page, Radix
 * garde la main (son `Trigger`, s'il y en a un). Les gestionnaires de l'appelant passent d'abord ; s'il empêche le
 * comportement par défaut, on ne touche à rien.
 */
export function useRetourFocus(onOpenAutoFocus: GestionnaireFocus, onCloseAutoFocus: GestionnaireFocus) {
  const ouvreur = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: (evenement: Event) => {
      ouvreur.current = elementARetenir(document.activeElement)
      onOpenAutoFocus?.(evenement)
    },
    onCloseAutoFocus: (evenement: Event) => {
      onCloseAutoFocus?.(evenement)
      const cible = ouvreur.current
      ouvreur.current = null
      if (evenement.defaultPrevented || !cible || !cible.isConnected) return
      evenement.preventDefault()
      cible.focus({ preventScroll: true })
    },
  }
}

/** L'élément à qui rendre le focus : un élément de la page, pas `<body>` (le focus n'y est que parce qu'il s'est perdu). */
export function elementARetenir(actif: Element | null): HTMLElement | null {
  if (!actif || actif === actif.ownerDocument.body || actif === actif.ownerDocument.documentElement) return null
  return typeof (actif as HTMLElement).focus === 'function' ? (actif as HTMLElement) : null
}

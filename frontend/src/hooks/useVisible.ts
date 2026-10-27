import { useEffect, type RefObject } from 'react'

/** Appelle `entree` quand l'élément reste visible `delai` ms (marge de `marge` px autour de
 *  l'écran), et `sortie` quand il le quitte. Le délai évite de lancer des requêtes pour les
 *  lignes qu'un défilement rapide ne fait que croiser. Sans IntersectionObserver : rien. */
export function useVisible(
  ref: RefObject<Element>,
  actif: boolean,
  entree: () => void,
  sortie: () => void,
  { delai = 200, marge = 240 }: { delai?: number; marge?: number } = {},
): void {
  useEffect(() => {
    const el = ref.current
    if (!actif || !el || typeof IntersectionObserver === 'undefined') return
    let minuteur: ReturnType<typeof setTimeout> | null = null
    const obs = new IntersectionObserver((entrees) => {
      const visible = entrees[entrees.length - 1]?.isIntersecting
      if (visible && minuteur === null) {
        minuteur = setTimeout(() => { minuteur = null; entree() }, delai)
      } else if (!visible) {
        if (minuteur !== null) { clearTimeout(minuteur); minuteur = null }
        sortie()
      }
    }, { rootMargin: `${marge}px 0px` })
    obs.observe(el)
    return () => {
      obs.disconnect()
      if (minuteur !== null) clearTimeout(minuteur)
      sortie()
    }
    // entree/sortie sont stables côté appelant (dépendent de l'identifiant seul)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, actif, delai, marge])
}

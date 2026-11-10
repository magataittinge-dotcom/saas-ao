import { useEffect, useState, type RefObject } from 'react'

/**
 * Le `h1` de l'écran est-il sorti de l'écran ? (VEILLE-DESIGN P10). La coquille observe le premier `h1` de `<main>`, quel que
 * soit l'écran : la barre du haut ne montre son petit titre que lorsque celui de la page n'est plus visible, et le retire dès
 * qu'il revient. Aucun écran n'a rien à déclarer. `cle` : l'adresse (on repart de « visible » à chaque changement d'écran).
 */
export function useTitreSorti(main: RefObject<HTMLElement>, cle: string): boolean {
  const [sorti, setSorti] = useState(false)
  useEffect(() => {
    const racine = main.current
    setSorti(false)
    if (!racine || typeof IntersectionObserver === 'undefined') return undefined
    let h1: Element | null = null
    const io = new IntersectionObserver((entrees) => {
      const derniere = entrees[entrees.length - 1]
      if (derniere) setSorti(!derniere.isIntersecting)
    }, { root: racine, threshold: 0 })
    const viser = () => {
      const trouve = racine.querySelector('h1')
      if (trouve === h1) return
      if (h1) io.unobserve(h1)
      h1 = trouve
      if (h1) io.observe(h1)
      else setSorti(false)
    }
    viser()
    // l'écran arrive après son morceau de code (Suspense) ou ses données : on retrouve le h1 quand le contenu change
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(viser)
    mo?.observe(racine, { childList: true, subtree: true })
    return () => { io.disconnect(); mo?.disconnect() }
  }, [main, cle])
  return sorti
}

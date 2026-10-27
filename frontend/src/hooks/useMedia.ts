import { useEffect, useRef, useState } from 'react'

/** Vrai quand la requête média correspond ; faux hors navigateur (rendu statique, tests). */
export function useMedia(requete: string): boolean {
  const lire = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(requete).matches
  const [ok, setOk] = useState<boolean>(lire)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const liste = window.matchMedia(requete)
    const maj = () => setOk(liste.matches)
    maj()
    liste.addEventListener('change', maj)
    return () => liste.removeEventListener('change', maj)
  }, [requete])
  return ok
}

/** Le panneau « Voir dans le DCE » devient une feuille qui monte du bas sous 1024 px
 *  (le téléphone, et la tablette où la barre latérale laisse peu de largeur). */
export const REQUETE_FEUILLE = '(max-width: 1023px)'

/** Mouvement réduit demandé par le système : plus d'animation, défilement immédiat. */
export const REQUETE_MOUVEMENT_REDUIT = '(prefers-reduced-motion: reduce)'

/** Largeur (px CSS) d'un élément, suivie à chaque redimensionnement. 0 tant qu'inconnue. */
export function useLargeur<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [largeur, setLargeur] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setLargeur(Math.floor(el.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => setLargeur(Math.floor(el.clientWidth)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, largeur]
}

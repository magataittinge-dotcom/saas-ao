import { useEffect, useState } from 'react'

const REQUETE = '(prefers-reduced-motion: reduce)'

/** Vrai si l'utilisateur a demandé de réduire les animations (suit le réglage en direct). */
export function useMouvementReduit(): boolean {
  const lire = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REQUETE).matches
  const [reduit, setReduit] = useState(lire)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REQUETE)
    const maj = () => setReduit(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [])
  return reduit
}

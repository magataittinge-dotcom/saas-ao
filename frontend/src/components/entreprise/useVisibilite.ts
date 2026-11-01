import { useEffect, useState } from 'react'

/** Vrai tant que l'élément est dans la zone visible (marge 100 px pour précharger). Sans IntersectionObserver : vrai. */
export function useALEcran(ref: React.RefObject<HTMLElement>): boolean {
  const [vu, setVu] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== 'function') { setVu(true); return }
    const io = new IntersectionObserver((es) => setVu(es[es.length - 1].isIntersecting), { rootMargin: '100px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return vu
}

/** Vrai tant que l'onglet du navigateur est visible. */
export function useOngletVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const maj = () => setVisible(document.visibilityState !== 'hidden')
    maj()
    document.addEventListener('visibilitychange', maj)
    return () => document.removeEventListener('visibilitychange', maj)
  }, [])
  return visible
}

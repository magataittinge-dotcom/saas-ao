import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

/**
 * Le menu « … » d'un élément : les gestes rares (« Non concerné »…) ne s'affichent pas sur chaque ligne. S'ouvre sous le bouton ;
 * Échap ou un clic ailleurs le ferme. Cible de 44 px au toucher. `children` reçoit la fonction qui le referme.
 */
export function MenuLigne({ libelle, children }: { libelle: string; children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => { if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  return (
    <div ref={racine} className="relative shrink-0">
      <button
        type="button"
        aria-label={libelle}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {ouvert && (
        <div role="menu" aria-label={libelle} className="absolute right-0 top-full z-20 mt-1 flex w-56 flex-col rounded-lg border border-bord-2 bg-surface-0 p-1.5 shadow-card">
          {children(() => setOuvert(false))}
        </div>
      )}
    </div>
  )
}

export default MenuLigne

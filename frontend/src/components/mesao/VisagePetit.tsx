import { POSTER_OUVERT } from '@/lib/entreprise/visage'
import { cn } from '@/lib/utils'

/**
 * Le visage de Synorix en petit : l'image fixe (yeux ouverts), sans vidéo ni mouvement. Un médaillon sombre derrière, les bords
 * fondus par un masque (comme le visage de « Mon entreprise »). Décoratif : masqué aux lecteurs d'écran.
 */
const MASQUE = 'radial-gradient(ellipse 52% 46% at 50% 47%, black 62%, transparent 82%)'

export function VisagePetit({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-visage-petit="" className={cn('flex items-center justify-center overflow-hidden rounded-carte bg-surface-dark', className)}>
      <img src={POSTER_OUVERT} alt="" width={150} height={225} loading="lazy" decoding="async" className="h-[225px] w-[150px] max-w-none object-cover" style={{ WebkitMaskImage: MASQUE, maskImage: MASQUE }} />
    </div>
  )
}

/**
 * Le visage en rond (direction A) : l'image fixe dans un médaillon sombre, cerclé d'un trait d'aurore (la marque, pas un état)
 * avec un éclat d'or : un arc court sur le liseré, comme la flamme dans le visage (.eclat-or, index.css).
 * Taille de 40 à 96 px. Décoratif : masqué aux lecteurs d'écran.
 */
export function VisageRond({ taille = 52, className }: { taille?: number; className?: string }) {
  return (
    <span aria-hidden="true" data-visage-petit="" style={{ width: taille, height: taille }}
      className={cn('relative grid shrink-0 place-items-center rounded-full bg-surface-dark ring-[1.5px] ring-aurore-mark ring-offset-2 ring-offset-surface-0', className)}>
      <span className="grid size-full place-items-center overflow-hidden rounded-full">
        <img src={POSTER_OUVERT} alt="" width={150} height={225} loading="lazy" decoding="async"
          style={{ width: taille * 1.15, height: taille * 1.72, WebkitMaskImage: MASQUE, maskImage: MASQUE }}
          className="max-w-none object-cover" />
      </span>
      <span className="eclat-or" />
    </span>
  )
}

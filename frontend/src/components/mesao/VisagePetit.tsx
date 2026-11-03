import { POSTER_OUVERT } from '@/lib/entreprise/visage'
import { cn } from '@/lib/utils'

/**
 * Le visage de Synorix en petit : l'image fixe (yeux ouverts), sans vidéo ni mouvement. Un médaillon sombre derrière, les bords
 * fondus par un masque (comme le visage de « Mon entreprise »). Décoratif : masqué aux lecteurs d'écran.
 */
const MASQUE = 'radial-gradient(ellipse 52% 46% at 50% 47%, #000 62%, transparent 82%)'

export function VisagePetit({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-visage-petit="" className={cn('flex items-center justify-center overflow-hidden rounded-carte bg-surface-dark', className)}>
      <img src={POSTER_OUVERT} alt="" width={150} height={225} loading="lazy" decoding="async" className="h-[225px] w-[150px] max-w-none object-cover" style={{ WebkitMaskImage: MASQUE, maskImage: MASQUE }} />
    </div>
  )
}

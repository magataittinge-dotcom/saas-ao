import * as React from 'react'
import { POSTER_OUVERT } from '@/lib/entreprise/visage'
import { cn } from '@/lib/utils'

const MASQUE = 'visage-masque'

/**
 * « Synorix parle » (VEILLE-DESIGN P29, défaut 9 du fondateur) : le visage, 32 px, collé à la phrase que Synorix dit.
 * C'est le SEUL endroit où le visage apparaît hors de « Mon entreprise » : une fois par écran au plus, jamais en vignette d'un
 * AO, jamais dans une ligne ou une carte d'AO, jamais en décor. Image fixe (aucune vidéo, aucun mouvement), décorative pour
 * les lecteurs d'écran : c'est la phrase qui compte. Garde-fous : « visage-en-vignette » (npm test) et grille.mjs (banc).
 */
export function SynorixParle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div data-synorix-parle="" className={cn('flex items-start gap-3', className)}>
      <span aria-hidden="true" data-visage="" className="relative mt-0.5 grid size-8 shrink-0 place-items-center overflow-hidden rounded-pilule bg-surface-dark ring-1 ring-aurore-mark">
        <img src={POSTER_OUVERT} alt="" width={37} height={55} loading="lazy" decoding="async" className={cn(MASQUE, 'h-[55px] w-[37px] max-w-none object-cover')} />
      </span>
      <div className="min-w-0 flex-1">
        <p data-voix-synorix="" className="text-base text-fg">{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

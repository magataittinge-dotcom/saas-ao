import * as React from 'react'
import { POSTER_OUVERT } from '@/lib/entreprise/visage'
import { cn } from '@/lib/utils'

const MASQUE = 'visage-masque'

/**
 * « Synorix parle » (VEILLE-DESIGN P29, défaut 9 du fondateur) : le visage, 56 px, collé à la phrase que Synorix dit
 * (à 32 px, c'était « une tache bleu-noir » où l'on ne reconnaissait ni visage ni marque : jury, tour 1).
 * C'est le SEUL endroit où le visage apparaît hors de « Mon entreprise » : une fois par écran au plus, jamais en vignette d'un
 * AO, jamais dans une ligne ou une carte d'AO, jamais en décor. Image fixe (aucune vidéo, aucun mouvement), décorative pour
 * les lecteurs d'écran : c'est la phrase qui compte. Garde-fous : « visage-en-vignette » (npm test) et grille.mjs (banc).
 */
export function SynorixParle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div data-synorix-parle="" className={cn('flex items-center gap-4', className)}>
      <span aria-hidden="true" data-visage="" className="relative grid size-14 shrink-0 place-items-center self-start overflow-hidden rounded-pilule bg-surface-dark ring-1 ring-aurore-mark">
        {/* le visage entier dans le rond (front, yeux, bouche) : l'image tient en hauteur, ses bords se fondent dans le fond nuit */}
        <img src={POSTER_OUVERT} alt="" width={50} height={74} loading="lazy" decoding="async" className={cn(MASQUE, 'h-[74px] w-[50px] max-w-none object-cover')} />
      </span>
      <div className="min-w-0 flex-1">
        <p data-voix-synorix="" className="max-w-[70ch] text-base text-fg">{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

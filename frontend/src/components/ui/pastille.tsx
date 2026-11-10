import * as React from 'react'
import { AlertCircle, Check, CircleDashed, Clock, Radar, Loader, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Les six sens (DESIGN.md § Colors) : bleu en cours · vert fait · ambre à surveiller · rouge urgent · turquoise veille · gris à venir. */
export type Sens = 'bleu' | 'vert' | 'ambre' | 'rouge' | 'turquoise' | 'gris'

const TONS: Record<Sens, string> = {
  bleu: 'bg-bleu-soft text-bleu-ink',
  vert: 'bg-vert-soft text-vert-ink',
  ambre: 'bg-ambre-soft text-ambre-ink',
  rouge: 'bg-rouge-soft text-rouge-ink',
  turquoise: 'bg-turquoise-soft text-turquoise-ink',
  gris: 'bg-gris-soft text-gris-ink',
}
const ICONES: Record<Sens, LucideIcon> = { bleu: Loader, vert: Check, ambre: Clock, rouge: AlertCircle, turquoise: Radar, gris: CircleDashed }

/**
 * Pastille d'état : un sens, un mot, une icône (jamais la couleur seule). Pilule, 12,5 px / 500, casse de phrase, chiffres
 * tabulaires. Jamais l'accent d'aurore, jamais l'or. `icone={null}` la retire (dans une rangée qui porte déjà l'icône).
 * Au téléphone, un long libellé passe à la ligne dans la pastille au lieu de sortir de l'écran (une ligne : même hauteur).
 */
export function PastilleEtat({ sens, icone, children, className, ...props }: { sens: Sens; icone?: LucideIcon | null } & React.HTMLAttributes<HTMLSpanElement>) {
  const Icone = icone === undefined ? ICONES[sens] : icone
  return (
    <span data-sens={sens} className={cn('chiffres inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-pilule px-2.5 text-xs font-medium max-md:max-w-full max-md:whitespace-normal max-md:py-0.5 max-md:text-left', TONS[sens], className)} {...props}>
      {Icone && <Icone aria-hidden size={13} strokeWidth={2} className="shrink-0" />}
      {children}
    </span>
  )
}

/** Compteur ou point posé sur une icône (barre latérale, onglets) : rouge à 3 jours ou moins, ambre de 4 à 7 jours. */
export function PastilleCompte({ valeur, sens = 'ambre', className, ...props }: { valeur?: number | string; sens?: Sens } & React.HTMLAttributes<HTMLSpanElement>) {
  const ton = cn(TONS[sens], sens === 'rouge' ? 'border-rouge-mark' : sens === 'ambre' ? 'border-ambre-mark' : sens === 'vert' ? 'border-vert-mark' : sens === 'bleu' ? 'border-bleu-mark' : sens === 'turquoise' ? 'border-turquoise-mark' : 'border-gris-mark')
  return valeur === undefined
    ? <span aria-hidden className={cn('block size-2.5 rounded-pilule border', ton, className)} {...props} />
    : <span className={cn('chiffres flex h-[18px] min-w-[18px] items-center justify-center rounded-pilule border px-1 text-xs font-semibold leading-none', ton, className)} {...props}>{valeur}</span>
}

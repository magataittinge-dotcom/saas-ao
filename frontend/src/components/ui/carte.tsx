import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * La carte du système : papier `--surface-0`, trait `--border-1` de 1 px, rayon 22, appui à peine visible (`--shadow-card`,
 * avec le filet de lumière en nuit). Plate au repos : au survol d'une carte cliquable, seul le trait passe à `--border-2`.
 * Jamais de carte dans une carte : à l'intérieur, des rangées séparées par un filet (`RangeeCarte`).
 */
export const Carte = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { cliquable?: boolean; sansMarge?: boolean }>(
  ({ className, cliquable, sansMarge, ...props }, ref) => (
    <div ref={ref} data-surface=""
      className={cn('rounded-carte border border-bord bg-surface-0 text-fg shadow-card', !sansMarge && 'p-5 sm:p-6',
        cliquable && 'cursor-pointer transition-colors duration-fast ease-survol hover:border-bord-2 active:bg-surface-1', className)}
      {...props} />
  ),
)
Carte.displayName = 'Carte'

/** Le titre d'une carte : 17 px / 600, jamais en serif. */
export function TitreCarte({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold text-fg', className)} {...props} />
}

/** Une rangée dans une carte : séparée de la précédente par un filet, 52 px au moins. */
export function RangeeCarte({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-[52px] items-center gap-3 border-t border-bord py-2 first:border-t-0', className)} {...props} />
}

import { FIL_ETAPES } from '@/lib/mesAO'
import { cn } from '@/lib/utils'

/** La phrase qui dit le partage des rôles (VEILLE-PRODUIT A6) : la même sur le site, à l'accueil et dans « Mes AO ». */
export const PARTAGE_DES_ROLES = 'Synorix lit et rédige ; vous décidez et vous déposez.'

/**
 * Les sept étapes d'un appel d'offres, dans l'ordre, sur une ligne (A6) : Dépôt · Lots · Décider · Pièces · Plan · Rédiger ·
 * Export. Les noms sont ceux du fil d'étapes de l'AO (`lib/mesAO.ts`) : un nouveau client les retrouve tels quels ensuite.
 */
export function FilSeptEtapes({ className }: { className?: string }) {
  return (
    <ol aria-label="Les sept étapes d’un appel d’offres" className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg', className)}>
      {FIL_ETAPES.map((etape, i) => (
        <li key={etape} className="flex items-center gap-2">
          {etape}
          {i < FIL_ETAPES.length - 1 && <span aria-hidden className="text-fg-3">·</span>}
        </li>
      ))}
    </ol>
  )
}

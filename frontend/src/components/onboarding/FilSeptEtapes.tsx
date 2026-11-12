import { FIL_ETAPES } from '@/lib/mesAO'
import { cn } from '@/lib/utils'

/** La phrase qui dit le partage des rôles (VEILLE-PRODUIT A6) : la même sur le site, à l'accueil et dans « Mes AO ». */
export const PARTAGE_DES_ROLES = 'Synorix lit et rédige ; vous décidez et vous déposez.'

/**
 * Les sept étapes d'un appel d'offres, dans l'ordre (A6), dessinées comme un fil : un rond numéroté par étape, un trait d'un
 * rond au suivant, le nom dessous. Le fil est inactif (ni lien ni étape courante) : il montre le chemin à un nouveau client,
 * avec les noms du fil d'étapes de l'AO (`lib/mesAO.ts`), qu'il retrouve tels quels ensuite. Sept colonnes égales : rien ne
 * passe à la ligne, à 390 px comme dans une carte étroite (jury, tour 1 : la liste en texte nu cassait en laissant « Export » seul).
 */
export function FilSeptEtapes({ className }: { className?: string }) {
  return (
    <ol aria-label="Les sept étapes d’un appel d’offres" className={cn('grid grid-cols-7', className)}>
      {FIL_ETAPES.map((etape, i) => (
        <li key={etape} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center">
          {i > 0 && <span aria-hidden className="absolute right-[calc(50%+18px)] top-3.5 h-px w-[calc(100%-36px)] bg-bord-2" />}
          <span aria-hidden className="relative grid size-7 place-items-center rounded-pilule border border-bord-2 bg-surface-0 text-xs font-medium text-fg-2">{i + 1}</span>
          <span className="text-xs font-medium text-fg max-sm:text-micro">{etape}</span>
        </li>
      ))}
    </ol>
  )
}

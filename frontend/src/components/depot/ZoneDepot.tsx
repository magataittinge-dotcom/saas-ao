import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Ce que Synorix fait du dossier une fois déposé : trois temps, dits avant le geste (jury, tour 1 : « aucune indication de la suite »). */
export const SUITE_DEPOT: readonly string[] = [
  'Synorix range le dossier et reconnaît chaque pièce : règlement, clauses, tableaux de prix.',
  'Il repère les lots : vous choisissez ceux sur lesquels vous répondez.',
  'Il relève chaque exigence avec sa source, en quelques minutes.',
]

/**
 * LA zone de dépôt d'un dossier (Nouvel appel d'offres, étape Dépôt, écrans d'accueil) : une surface Synorix, blanche, au
 * trait plein d'un pixel. Ni pointillés, ni nuage centré, ni aplat gris (jury, tour 1 : « le motif de catalogue, sur l'écran
 * que tout nouveau client verra en premier »). À gauche le geste (un titre, une phrase, LE bouton, les formats et la taille
 * acceptés) ; à droite, quand `suite` est donnée, ce que Synorix fera du dossier. Pendant un glisser : le trait d'accent.
 * Présentation seule : le dépôt lui-même (react-dropzone) est branché par l'écran, qui passe `racine` et `entree`.
 */
/** Le titre de la zone : on glisse à l'ordinateur, on choisit au téléphone (jury, tour 3 : « Glissez ici » n'a pas de sens au doigt). */
export function TitreDepot() {
  return (
    <>
      <span className="max-sm:hidden">Glissez ici le dossier de l’acheteur</span>
      <span className="sm:hidden">Choisissez le dossier de l’acheteur</span>
    </>
  )
}

export function ZoneDepot({ racine, entree, survol, titre, phrase, bouton, formats, suite, centree, className }: {
  racine: HTMLAttributes<HTMLDivElement>
  /** Le sélecteur de fichier caché (`<EntreeFichier {...getInputProps()} />`). */
  entree: ReactNode
  /** Un fichier est au-dessus de la zone. */
  survol: boolean
  titre: ReactNode
  phrase?: ReactNode
  bouton?: ReactNode
  /** « PDF, Word, Excel, OpenDocument ou ZIP, jusqu'à 2 Go ». */
  formats?: ReactNode
  suite?: readonly string[]
  /** Écrans d'accueil : le texte au centre de la zone (une seule colonne). */
  centree?: boolean
  className?: string
}) {
  return (
    <div
      {...racine}
      data-zone-depot=""
      className={cn(
        'w-full rounded-carte border bg-surface-0 shadow-card transition-colors duration-survol ease-survol',
        survol ? 'border-accent-ring bg-accent-tint' : 'border-bord',
        suite ? 'grid md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]' : centree ? 'grid place-items-center text-center' : 'grid',
        className,
      )}
    >
      {entree}
      {/* Avec la colonne « Ensuite », les deux têtes de colonne partent de la même ligne (jury, tour 3 : l'une centrée, l'autre en haut) */}
      <div className={cn('grid p-8 max-sm:p-5', suite ? 'content-start' : 'content-center', centree && 'justify-items-center')}>
        <p className="text-lg font-semibold text-fg">{titre}</p>
        {phrase && <p className="mt-1.5 max-w-[52ch] text-sm text-fg-2">{phrase}</p>}
        {bouton && <div className="mt-5">{bouton}</div>}
        {formats && <p className="mt-3 text-xs text-fg-3">{formats}</p>}
      </div>
      {suite && (
        <div className="border-bord p-8 max-md:border-t max-sm:p-5 md:border-l">
          <p className="text-sm font-medium text-fg-2">Ensuite</p>
          <ol className="mt-2 divide-y divide-bord">
            {suite.map((temps, i) => (
              <li key={temps} className="flex gap-3 py-3 text-sm text-fg last:pb-0">
                <span aria-hidden="true" className="chiffres w-4 shrink-0 text-fg-3">{i + 1}</span>
                <span className="min-w-0">{temps}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

export default ZoneDepot

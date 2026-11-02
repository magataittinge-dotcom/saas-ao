import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Le gabarit d'une étape de l'appel d'offres, bâti sur « Mon entreprise » :
 *  1. en-tête : le titre de l'étape, UNE ligne qui dit à quoi elle sert, l'action principale à droite (une seule) ;
 *  2. le résumé : trois ou quatre cartes égales sur toute la largeur (`BandeResume`) ;
 *  3. les sections, sur toute la largeur (`SectionEtape`), sous-titres en capitales ;
 *  4. la barre d'action collée en bas (`BarreEtape`), facultative.
 *
 * Le fil des étapes et l'en-tête de l'AO (nom, acheteur, échéance) restent ceux de `routes/Project.tsx` : le titre de
 * l'étape est donc un `h2` (le `h1` est le nom de l'AO).
 *
 * Téléphone (≤ 768 px) : une seule colonne ; les boutons de l'en-tête passent sous le titre. Quand `barre` est fournie,
 * l'action principale de l'en-tête disparaît au téléphone : c'est la barre qui la porte (voir `ActionsBarreTel`).
 */
export function GabaritEtape({ titre, utilite, actionPrincipale, actionsSecondaires, resume, barre, children, className }: {
  titre: string
  utilite: string
  actionPrincipale?: ReactNode
  actionsSecondaires?: ReactNode
  resume?: ReactNode
  barre?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div data-gabarit-etape="" className={cn('space-y-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <h2 className="font-display text-h5 text-fg">{titre}</h2>
          <p className="mt-1.5 text-sm text-fg-2">{utilite}</p>
        </div>
        {(actionPrincipale || actionsSecondaires) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 max-[768px]:w-full">
            {actionsSecondaires && <div data-actions-secondaires="" className="flex flex-wrap items-center gap-3 max-[768px]:w-full">{actionsSecondaires}</div>}
            {actionPrincipale && (
              <div data-action-principale="" className={cn('max-[768px]:w-full', barre ? 'max-[768px]:hidden' : null)}>{actionPrincipale}</div>
            )}
          </div>
        )}
      </header>
      {resume}
      {children && <div className="space-y-8">{children}</div>}
      {barre}
    </div>
  )
}

/**
 * Dans la barre collée en bas : ce qui ne s'affiche qu'au téléphone. L'action principale de l'en-tête y est portée par la
 * barre, sans doublon sur ordinateur (où la barre garde le retour et le bilan).
 */
export function ActionsBarreTel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('hidden shrink-0 items-center gap-2 max-[768px]:ml-auto max-[768px]:flex', className)}>{children}</div>
}

export default GabaritEtape

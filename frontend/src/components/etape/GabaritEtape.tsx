import { useId, useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BoutonIcone } from '@/components/ui/bouton'
import { useAideEtape, type AideEtape } from './aideEtape'

/**
 * Le gabarit d'une étape de l'appel d'offres, le même pour les sept :
 *  1. en-tête : le titre de l'étape (LE `h1` de l'écran, en serif : la barre du haut porte déjà « Mes AO / nom de l'AO »),
 *     UNE ligne qui dit à quoi elle sert, le bouton « ? » (A4) et l'action de l'étape à droite ;
 *  2. `message` : ce qui vient d'arriver (une erreur, un échec), UNE fois, ici, jamais aussi dans la barre du bas ;
 *  3. le résumé : une bande de cases (`BandeResume`) ;
 *  4. les sections, sur toute la largeur (`SectionEtape`) ;
 *  5. la barre d'action du bas (`BarreEtape`), facultative.
 *
 * Une seule action principale par écran (P1) : quand `barre` est fournie, c'est elle qui porte l'action principale au
 * téléphone, et l'en-tête ne la répète pas ; au bureau, le « Étape suivante » de la barre passe au trait dès que l'en-tête
 * montre un `<Bouton variante="principal">` (c'est automatique).
 *
 * « ? » : il déplie trois lignes DANS l'écran (ce que montre l'écran, ce que vous avez à faire, les mots de l'écran : les
 * sigles de lib/lexique.ts). Ni bulle flottante, ni visite guidée, ni lien d'aide. L'aide vient de `aide`, sinon de la
 * page de l'AO (aideEtape.tsx, une entrée par étape).
 */
export function GabaritEtape({ titre, utilite, actionPrincipale, actionsSecondaires, message, resume, barre, aide, children, className }: {
  titre: string
  utilite: string
  actionPrincipale?: ReactNode
  actionsSecondaires?: ReactNode
  /** Le message de l'étape (échec d'une action, information) : posé une seule fois, sous l'en-tête. */
  message?: ReactNode
  resume?: ReactNode
  barre?: ReactNode
  aide?: AideEtape
  children?: ReactNode
  className?: string
}) {
  const aideEtape = useAideEtape()
  const lignes = aide ?? aideEtape
  const [ouverte, setOuverte] = useState(false)
  const idAide = useId()
  return (
    <div data-gabarit-etape="" className={cn('space-y-6', className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex items-center gap-1">
            <h1 className="titre-page min-w-0 break-words text-fg">{titre}</h1>
            {lignes && (
              <BoutonIcone libelle={ouverte ? 'Refermer l’aide de cet écran' : 'Comprendre cet écran'} aria-expanded={ouverte} aria-controls={idAide}
                onClick={() => setOuverte((o) => !o)} data-aide-bouton="" className={cn(ouverte && 'bg-surface-1 text-fg')}>
                <CircleHelp aria-hidden strokeWidth={1.5} />
              </BoutonIcone>
            )}
          </div>
          <p className="mt-2 text-base text-fg-2">{utilite}</p>
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
      {lignes && ouverte && (
        <dl id={idAide} data-aide-etape="" className="grid gap-3 rounded-lg bg-surface-1 px-5 py-4 text-sm sm:grid-cols-[12rem_1fr] sm:gap-x-6">
          <dt className="font-medium text-fg-2">Ce que montre l’écran</dt>
          <dd className="text-fg">{lignes.montre}</dd>
          <dt className="font-medium text-fg-2">Ce que vous avez à faire</dt>
          <dd className="text-fg">{lignes.aFaire}</dd>
          {lignes.sigles && lignes.sigles.length > 0 && (
            <>
              <dt className="font-medium text-fg-2">Les mots de l’écran</dt>
              <dd className="grid gap-1 text-fg">
                {lignes.sigles.map((e) => <span key={e.sigle}><span className="font-semibold">{e.sigle}</span> : {e.developpe}. {e.explication}</span>)}
              </dd>
            </>
          )}
        </dl>
      )}
      {message && <div data-message-etape="">{message}</div>}
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

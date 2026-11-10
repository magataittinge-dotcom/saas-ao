import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * La page d'un écran (VEILLE-DESIGN P8, P10). Le conteneur (1 200 px, gouttière 16 / 24 / 32) est posé UNE fois par la coquille
 * (`layout/Layout.tsx`, classe `.conteneur`) : une route ne pose ni largeur ni marge latérale, elle rend `<Page>`.
 *
 *  - `titre` : le seul `h1` de l'écran, en serif. La barre du haut ne le répète pas : son petit titre n'apparaît que lorsque
 *    ce `h1` est sorti de l'écran (la coquille l'observe, rien à faire ici).
 *  - `sousTitre` : une ligne qui dit autre chose que le titre (jamais le même mot, jamais le premier chiffre de l'écran).
 *  - `action` : l'action de l'écran, à droite du titre (sous le titre au téléphone). Un seul `<Bouton variante="principal">`.
 *  - `etroite` : un écran de lecture ou de réglages (760 px) ; il s'aligne à GAUCHE dans le conteneur, il ne se recentre pas.
 *  - `pleine` : Rédiger seulement ; le conteneur s'ouvre à toute la largeur, à la gouttière.
 */
export function Page({ titre, sousTitre, action, avant, etroite, pleine, children, className }: {
  titre: ReactNode
  sousTitre?: ReactNode
  action?: ReactNode
  /** Au-dessus du titre : un fil d'étapes, un retour. Jamais un surtitre. */
  avant?: ReactNode
  etroite?: boolean
  pleine?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <div data-page={etroite ? 'etroite' : pleine ? 'pleine' : 'large'} data-page-pleine={pleine ? '' : undefined} className={cn('page', etroite && 'page-etroite', className)}>
      {avant}
      <EnTetePage titre={titre} sousTitre={sousTitre} action={action} />
      {children}
    </div>
  )
}

/** L'en-tête d'une page : le `h1` serif, sa sous-ligne, l'action à droite. `Page` le pose ; seul l'écran d'un AO le pose lui-même. */
export function EnTetePage({ titre, sousTitre, action, className }: { titre: ReactNode; sousTitre?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header data-en-tete-page="" className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6 max-[768px]:pb-5', className)}>
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="titre-page break-words text-fg">{titre}</h1>
        {sousTitre && <p className="mt-2 text-base text-fg-2">{sousTitre}</p>}
      </div>
      {action && <div data-page-action="" className="flex shrink-0 flex-wrap items-center gap-2 max-[768px]:w-full">{action}</div>}
    </header>
  )
}

/** Un titre de section : trois fois plus d'air au-dessus qu'en dessous (P9 : 40 / 16, 30 / 12 au téléphone). */
export function TitreSection({ children, action, className, id }: { children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn('titre-section flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1', className)}>
      <h2 id={id} className="text-lg font-semibold text-fg">{children}</h2>
      {action}
    </div>
  )
}

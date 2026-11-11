import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'

/**
 * Le bouton du système. Cinq variantes, une forme par rôle (VEILLE-DESIGN P1, P14, P17) :
 *  - `principal` : l'action qui fait avancer l'écran. Pilule, aplat d'accent. UN SEUL PAR ÉCRAN : quand il est monté, le bouton
 *    « Nouvel appel d'offres » de la barre passe au trait (uiStore.aplatsEcran). Jamais sur une action destructrice.
 *  - `secondaire` (par défaut) : papier, trait de champ, rayon 14.
 *  - `discret` : sans trait, pour les actions de rang trois et les barres d'outils.
 *  - `danger` : au trait rouge (supprimer, retirer). Jamais un aplat.
 *  - `lien` : un lien dans une phrase ou en fin de ligne.
 * États : survol = le fond change, rien ne bouge ; appui = scale(.98) en 100 ms ; focus = contour global de 2 px ;
 * désactivé = 45 % ; en cours = le libellé change (`libelleEnCours`) et le bouton se désactive : aucune roue qui tourne.
 * 44 px de haut, partout.
 */
export type VarianteBouton = 'principal' | 'secondaire' | 'discret' | 'danger' | 'lien'

const BASE = 'inline-flex min-h-11 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-[background-color,background-image,border-color,color,transform] duration-fast ease-survol active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0'

const VARIANTES: Record<VarianteBouton, string> = {
  principal: 'rounded-pilule bg-accent-fill px-5 text-accent-on shadow-cta hover:[background-image:var(--accent-fill-hover)]',
  secondaire: 'rounded-lg border border-bord-champ bg-surface-0 px-4 text-fg hover:bg-surface-1 active:bg-surface-2',
  discret: 'rounded-lg px-3 font-medium text-fg-2 hover:bg-surface-1 hover:text-fg active:bg-surface-2',
  danger: 'rounded-lg border border-rouge-mark bg-surface-0 px-4 text-rouge-ink hover:bg-rouge-soft active:bg-rouge-soft',
  lien: 'min-h-0 rounded px-0 font-medium text-accent-text underline-offset-4 hover:underline active:scale-100 [@media(pointer:coarse)]:min-h-11',
}

/** Les classes d'un bouton, pour un lien (`<Link className={classesBouton('secondaire')}>`). */
export const classesBouton = (variante: VarianteBouton = 'secondaire', className?: string) => cn(BASE, VARIANTES[variante], className)

export interface BoutonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBouton
  /** L'action est partie : le libellé devient `libelleEnCours`, le bouton se désactive. */
  enCours?: boolean
  libelleEnCours?: string
  /** Le bouton prend toute la largeur (formulaires au téléphone, barre du bas). */
  large?: boolean
  /** Le bouton de suite de la barre du bas (BoutonSuite) : compté à part, il cède l'aplat à l'action de l'écran. */
  suite?: boolean
  /** Un bouton de la coquille (« Nouvel appel d'offres » de la barre) : il n'est pas compté parmi les actions de l'écran. */
  coquille?: boolean
  asChild?: boolean
}

/**
 * L'aplat cédé (jury, tour 1) : quand l'état d'un AO n'admet qu'une action (remise passée : « Mettre à jour le statut »), la
 * page de l'AO porte l'aplat et l'étape le lui cède : sous `<AplatCede.Provider value>`, un bouton `principal` se dessine au
 * trait (`data-variante="secondaire"`, `data-aplat-cede`). Un dialogue, un tiroir ou un menu ouvert depuis l'étape remet la
 * valeur à faux : sa confirmation reste un aplat.
 */
export const AplatCede = React.createContext(false)

/** Compte les actions principales montées par l'écran (P1) : la barre du haut s'y règle. */
function useAplat(actif: boolean, suite: boolean) {
  const declarer = useUIStore((s) => s.declarerAplat)
  React.useEffect(() => {
    if (!actif) return undefined
    declarer(1, suite)
    return () => declarer(-1, suite)
  }, [actif, suite, declarer])
}

export const Bouton = React.forwardRef<HTMLButtonElement, BoutonProps>(
  ({ className, variante: demandee = 'secondaire', enCours = false, libelleEnCours, large, suite = false, coquille = false, asChild = false, disabled, children, type, ...props }, ref) => {
    const cede = React.useContext(AplatCede) && demandee === 'principal' && !coquille
    const variante: VarianteBouton = cede ? 'secondaire' : demandee
    useAplat(variante === 'principal' && !coquille, suite)
    const classes = classesBouton(variante, cn(large && 'w-full', className))
    if (asChild) return <Slot ref={ref} data-variante={variante} data-aplat-cede={cede ? '' : undefined} className={classes} {...props}>{children}</Slot>
    return (
      <button ref={ref} type={type ?? 'button'} data-variante={variante} data-aplat-cede={cede ? '' : undefined} className={classes} disabled={disabled || enCours} aria-busy={enCours || undefined} {...props}>
        {enCours && libelleEnCours ? libelleEnCours : children}
      </button>
    )
  },
)
Bouton.displayName = 'Bouton'

/** Un bouton réduit à son icône : 44 × 44, rond, toujours avec un nom (`libelle` = aria-label). */
export const BoutonIcone = React.forwardRef<HTMLButtonElement, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { libelle: string }>(
  ({ libelle, className, type, children, ...props }, ref) => (
    <button ref={ref} type={type ?? 'button'} aria-label={libelle}
      className={cn('grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-[background-color,color,transform] duration-fast ease-survol hover:bg-surface-1 hover:text-fg active:scale-[.98] active:bg-surface-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5', className)}
      {...props}>
      {children}
    </button>
  ),
)
BoutonIcone.displayName = 'BoutonIcone'

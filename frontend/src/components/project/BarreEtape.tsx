import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { Bouton } from '@/components/ui/bouton'
import { Menu, MenuContenu, MenuDeclencheur } from '@/components/ui/menu'

/**
 * La barre d'action du bas d'une étape d'un AO (« Étape suivante : Pièces »…), la même sur les sept étapes.
 *
 * Ordinateur : une barre flottante (papier, trait, ombre « flottant », rayon 22), collée à 16 px du bas pendant le défilement :
 * le bilan à gauche, les boutons à droite. Pas de verre ni de flou.
 * Téléphone (≤ 768 px) : UNE ligne de 56 px, bord à bord, au-dessus des onglets. Le bouton principal garde un texte court
 * (« Suivant : Pièces »), les boutons secondaires passent en icône (`aria-label`) ou dans le menu « … », le bilan s'abrège.
 * La barre reste dans le flux, à la fin du contenu : une fois la page descendue au maximum, le dernier élément est entièrement
 * visible au-dessus d'elle. Un champ qui prend le focus est ramené au-dessus de la barre (scroll-padding de <main>).
 *
 * Elle ne répète JAMAIS le message d'erreur de l'étape (il est posé une fois, sous l'en-tête : `GabaritEtape message`).
 *
 * Elle n'existe que si elle porte un geste (jury, tour 1 : à 1 440, une barre sans bouton répétait un état et recouvrait le
 * contenu sur Plan, Export, Décider). Sans bouton ni lien VISIBLE à cette largeur (les actions réservées au téléphone ne
 * comptent pas sur ordinateur), elle se retire : `data-sans-geste`, réglé dans index.css. Mesuré après le rendu, et à chaque
 * changement de contenu ou de largeur.
 */
export const HAUTEUR_BARRE_TEL = 56 // px — h-14

interface BarreEtapeProps {
  /** Disposition propre à l'ordinateur (colonne, retour à la ligne…) ; au téléphone la barre est toujours une ligne. */
  className?: string
  children: ReactNode
}

/** La barre porte-t-elle un geste visible : un bouton ou un lien qui a une boîte à l'écran (un élément `hidden` n'en a pas). */
export function gesteVisible(barre: Pick<HTMLElement, 'querySelectorAll'>): boolean {
  return Array.from(barre.querySelectorAll('button, a[href], [role="button"]')).some((el) => el.getClientRects().length > 0)
}

export default function BarreEtape({ className, children }: BarreEtapeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [sansGeste, setSansGeste] = useState(false)

  useEffect(() => {
    const barre = ref.current
    if (!barre) return undefined
    const compter = () => setSansGeste(!gesteVisible(barre))
    compter()
    const contenu = typeof MutationObserver === 'undefined' ? null : new MutationObserver(compter)
    contenu?.observe(barre, { childList: true, subtree: true })
    const largeur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compter)
    largeur?.observe(barre)
    return () => { contenu?.disconnect(); largeur?.disconnect() }
  }, [])

  // Le focus clavier (ou scrollIntoView) d'un champ proche du bas ne doit pas le laisser sous la barre.
  useEffect(() => {
    const barre = ref.current
    const defilant = barre?.closest('main') as HTMLElement | null
    if (!barre || !defilant) return
    const regler = () => {
      const h = barre.getBoundingClientRect().height
      defilant.style.scrollPaddingBottom = h > 0 ? `${Math.ceil(h) + 24}px` : ''
    }
    regler()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(regler)
    observer?.observe(barre)
    return () => {
      observer?.disconnect()
      defilant.style.scrollPaddingBottom = ''
    }
  }, [])

  return (
    <div
      ref={ref}
      data-barre-etape=""
      data-sans-geste={sansGeste ? '' : undefined}
      className={cn(
        'sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-4 rounded-carte border border-bord bg-surface-0 px-5 py-3 shadow-flottant',
        'max-[768px]:bottom-0 max-[768px]:-mx-[var(--gutter)] max-[768px]:h-14 max-[768px]:flex-nowrap max-[768px]:gap-2 max-[768px]:rounded-none max-[768px]:border-x-0 max-[768px]:border-b-0 max-[768px]:px-[var(--gutter)] max-[768px]:py-0 max-[768px]:shadow-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Le bilan de la barre : complet sur ordinateur (`bureau`), abrégé au téléphone (`tel`, ou rien). */
export function BilanBarre({ bureau, tel, className }: { bureau: ReactNode; tel?: ReactNode; className?: string }) {
  return (
    <>
      <div className={cn('flex min-w-0 items-center gap-2.5 text-sm text-fg-2 max-[768px]:hidden', className)}>{bureau}</div>
      {tel && <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-fg-2 max-[768px]:flex">{tel}</div>}
    </>
  )
}

/** Les boutons de droite : ils ne se replient jamais sous le bilan. */
export function ActionsBarre({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-3 max-[768px]:ml-auto max-[768px]:gap-2', className)}>{children}</div>
}

/**
 * Le bouton de suite : « Étape suivante : Pièces » sur ordinateur, « Suivant : Pièces » au téléphone.
 * C'est l'action principale de l'écran SAUF si l'écran en montre déjà une (le bouton de l'en-tête : « Lire ce dossier »,
 * « Valider le plan »…) : il passe alors au trait, tout seul (P1 : un seul aplat d'accent par écran).
 * En cours : son libellé change (`enCoursLibelle`) et il se désactive ; aucune roue.
 */
export function BoutonSuite({
  etape, onClick, disabled, enCours, enCoursLibelle = 'Validation…', icone: Icone, className,
}: {
  etape: string
  onClick: () => void
  disabled?: boolean
  enCours?: boolean
  enCoursLibelle?: string
  icone?: LucideIcon
  className?: string
}) {
  const autreAplat = useUIStore((s) => s.aplatsEcran) > 0
  return (
    <Bouton variante={autreAplat ? 'secondaire' : 'principal'} suite onClick={onClick} disabled={disabled} enCours={enCours} libelleEnCours={enCoursLibelle} className={className}>
      {Icone && <Icone aria-hidden />}
      <span>
        <span className="max-[768px]:hidden">Étape suivante</span>
        <span className="hidden max-[768px]:inline">Suivant</span>
        {' '}: {etape}
      </span>
      {!Icone && <ArrowRight aria-hidden />}
    </Bouton>
  )
}

/**
 * Un bouton secondaire de la barre : son texte sur ordinateur, une icône de 44 px au téléphone (le texte reste dans
 * `aria-label`).
 */
export function BoutonSecondaire({ libelle, icone: Icone = ArrowLeft, onClick }: { libelle: string; icone?: LucideIcon; onClick: () => void }) {
  return (
    <Bouton variante="secondaire" onClick={onClick} aria-label={libelle} className="max-[768px]:w-11 max-[768px]:px-0">
      <Icone aria-hidden className="hidden max-[768px]:block" />
      <span className="max-[768px]:hidden">{libelle}</span>
    </Bouton>
  )
}

/**
 * Le menu « … » du téléphone : les sorties secondaires, ouvertes au-dessus de la barre. C'est le menu du système (Radix :
 * Échap, clic ailleurs, retour du focus ; il reste dans l'écran). `children` reçoit la fonction qui le referme.
 */
export function MenuPlus({ libelle, children }: { libelle: string; children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="hidden shrink-0 max-[768px]:block">
      <Menu open={ouvert} onOpenChange={setOuvert}>
        <MenuDeclencheur aria-label={libelle}
          className="grid size-11 place-items-center rounded-lg border border-bord-champ bg-surface-0 text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-1 active:scale-[.98] data-[state=open]:bg-surface-1">
          <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden />
        </MenuDeclencheur>
        <MenuContenu side="top" aria-label={libelle} className="flex w-60 flex-col gap-1">{children(() => setOuvert(false))}</MenuContenu>
      </Menu>
    </div>
  )
}

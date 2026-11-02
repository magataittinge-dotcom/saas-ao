import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Loader2, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * La barre d'action collée au bas d'une étape d'un AO (« Étape suivante : Pièces », « Lire ce dossier »…).
 *
 * Ordinateur : la barre d'origine — `sticky -bottom-5 z-30`, qui compense le `py-5` de <main>, avec son bilan
 * à gauche et ses boutons à droite.
 * Téléphone (≤ 768 px, le seuil des onglets du bas) : UNE ligne de 56 px au plus. Le bouton principal garde un
 * texte court (« Suivant : Pièces »), les boutons secondaires passent en icône (`aria-label`) ou dans le menu « … »,
 * le bilan s'abrège ou disparaît. La barre reste dans le flux, à la fin du contenu (marge de 24 px) : une fois la
 * page descendue au maximum, le dernier élément est entièrement visible au-dessus d'elle.
 * Pendant le défilement, un champ qui prend le focus est ramené au-dessus de la barre (scroll-padding de <main>).
 */
export const HAUTEUR_BARRE_TEL = 56 // px — h-14

interface BarreEtapeProps {
  /** Disposition propre à l'ordinateur (colonne, retour à la ligne…) ; au téléphone la barre est toujours une ligne. */
  className?: string
  children: ReactNode
}

export default function BarreEtape({ className, children }: BarreEtapeProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Le focus clavier (ou scrollIntoView) d'un champ proche du bas ne doit pas le laisser sous la barre.
  useEffect(() => {
    const barre = ref.current
    const defilant = barre?.closest('main') as HTMLElement | null
    if (!barre || !defilant) return
    const regler = () => {
      const h = barre.getBoundingClientRect().height
      defilant.style.scrollPaddingBottom = h > 0 ? `${Math.ceil(h) + 8}px` : ''
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
      className={cn(
        'sticky -bottom-5 z-30 -mx-3 sm:-mx-4 mt-6 rounded-t-lg flex items-center justify-between px-6 py-3 gap-4',
        'max-[768px]:h-14 max-[768px]:flex-row max-[768px]:flex-nowrap max-[768px]:items-center max-[768px]:justify-between max-[768px]:gap-2 max-[768px]:px-3 max-[768px]:py-0',
        className,
      )}
      style={{
        background: 'color-mix(in srgb, var(--surface-0) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      {children}
    </div>
  )
}

/** Le bilan de la barre : complet sur ordinateur (`bureau`), abrégé au téléphone (`tel`, ou rien). */
export function BilanBarre({ bureau, tel, className }: { bureau: ReactNode; tel?: ReactNode; className?: string }) {
  return (
    <>
      <div className={cn('flex min-w-0 items-center gap-2.5 max-[768px]:hidden', className)}>{bureau}</div>
      {tel && <div className="hidden min-w-0 flex-1 items-center gap-2 max-[768px]:flex">{tel}</div>}
    </>
  )
}

/** Les boutons de droite : ils ne se replient jamais sous le bilan. */
export function ActionsBarre({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-3 max-[768px]:ml-auto max-[768px]:gap-2', className)}>{children}</div>
}

/**
 * Le bouton principal : « Étape suivante : Pièces » sur ordinateur, « Suivant : Pièces » au téléphone.
 * Un seul par écran (classe signature-btn).
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || enCours}
      className={cn('signature-btn whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed [@media(pointer:coarse)]:min-h-11', className)}
    >
      {enCours
        ? <><Loader2 size={16} className="animate-spin" aria-hidden /> {enCoursLibelle}</>
        : <>
            {Icone && <Icone size={16} aria-hidden />}
            <span>
              <span className="max-[768px]:hidden">Étape suivante</span>
              <span className="hidden max-[768px]:inline">Suivant</span>
              {'\u00a0'}: {etape}
            </span>
          </>}
    </button>
  )
}

/**
 * Un bouton secondaire : son texte sur ordinateur, une icône de 44 px au téléphone (le texte reste dans
 * `aria-label`).
 */
export function BoutonSecondaire({ libelle, icone: Icone = ArrowLeft, onClick }: { libelle: string; icone?: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-ds-bg-2 max-[768px]:h-11 max-[768px]:w-11 max-[768px]:p-0"
      style={{ color: 'var(--text-3)', border: '1px solid var(--border-1)' }}
    >
      <Icone size={18} aria-hidden className="hidden max-[768px]:block" />
      <span className="max-[768px]:hidden">{libelle}</span>
    </button>
  )
}

/**
 * Le menu « … » du téléphone : les sorties secondaires, ouvertes au-dessus de la barre. Échap ou un clic ailleurs le ferme.
 * `children` reçoit la fonction qui le referme.
 */
export function MenuPlus({ libelle, children }: { libelle: string; children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => { if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  return (
    <div ref={racine} className="relative hidden shrink-0 max-[768px]:block">
      <button
        type="button"
        aria-label={libelle}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
        style={{ color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {ouvert && (
        <div
          role="menu"
          aria-label={libelle}
          className="absolute bottom-full right-0 mb-2 flex w-60 flex-col gap-1 rounded-lg p-1.5"
          style={{ background: 'var(--surface-0)', border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)' }}
        >
          {children(() => setOuvert(false))}
        </div>
      )}
    </div>
  )
}

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, classeChamp } from '@/components/ui/input'

// Briques communes aux trois formulaires de « Mon entreprise » (reprises de l'ancien éditeur du profil).

// Boutons d'édition des listes (année, poste) : lien d'accent, retrait discret ; cibles 44 px au téléphone.
export const BOUTON_AJOUT = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11'
/** « Retirer » avec son mot, sous une carte de liste. */
export const BOUTON_RETIRER_TEXTE = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-fg-3 transition-colors duration-base ease-lien hover:text-danger [@media(pointer:coarse)]:min-h-11'
export const BOUTON_RETRAIT = 'grid size-9 shrink-0 place-items-center rounded-md text-fg-3 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-danger [@media(pointer:coarse)]:size-11'

/** Champ : l'étiquette est reliée au champ (id) ; `groupe` = plusieurs champs sous un même intitulé (pas de « for »). */
export function Field({ label, aide, groupe, children }: { label: string; aide?: string; groupe?: boolean; children: React.ReactElement | React.ReactNode }) {
  const id = useId()
  const enfant = !groupe && isValidElement(children) ? cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children
  const Tete = groupe ? 'span' : 'label'
  return (
    <div>
      <Tete {...(groupe ? {} : { htmlFor: id })} className="mb-1 block text-sm font-medium text-fg-2">{label}</Tete>
      {enfant}
      {aide && <p className="mt-1 text-xs text-fg-3">{aide}</p>}
    </div>
  )
}

/** Le reste d'un groupe, déplié à la demande : l'indispensable s'affiche d'abord. */
export function AfficherPlus({ libelle = 'Afficher plus', libelleOuvert = 'Afficher moins', children }: { libelle?: string; libelleOuvert?: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const id = useId()
  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 rounded-xs text-sm font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11"
      >
        {ouvert ? libelleOuvert : libelle}
        <ChevronDown size={15} className={cn('transition-transform duration-base ease-lien motion-reduce:transition-none', ouvert && 'rotate-180')} aria-hidden />
      </button>
      {ouvert && <div id={id} className="mt-4 space-y-4">{children}</div>}
    </div>
  )
}

/** Titre d'un groupe de champs d'une rubrique. */
export function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-4">
      <div>
        <h3 id={id} className="font-display text-base font-semibold text-fg">{titre}</h3>
        {aide && <p className="mt-0.5 text-xs text-fg-3">{aide}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Barre d'enregistrement : un seul « Enregistrer » par rubrique, collé en bas de la zone de défilement (<main>).
 * Dernière de son formulaire, elle reprend sa place dans le flux une fois la page descendue au maximum : rien n'est
 * recouvert. Pendant le défilement, un champ qui prend le focus (Tab, scrollIntoView) est ramené au-dessus d'elle :
 * `scroll-padding-bottom` de <main> suit sa hauteur (même principe que la barre d'une étape d'AO, `BarreEtape`).
 */
export function PiedEnregistrer({ enCours, reussi, erreur }: { enCours: boolean; reussi: boolean; erreur: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
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
    <div ref={ref} data-pied-enregistrer="" className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-bord-2 bg-[var(--glass-fill)] px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role={erreur ? 'alert' : 'status'} className={cn('text-sm', erreur ? 'text-danger' : 'text-fg-2')}>
          {erreur ?? (reussi ? 'Modifications enregistrées' : '')}
        </p>
        <Button type="submit" disabled={enCours} className="px-6">
          {reussi && !enCours ? <><CheckCircle2 size={16} aria-hidden />Enregistré</> : <><Save size={16} aria-hidden />{enCours ? 'Enregistrement...' : 'Enregistrer'}</>}
        </Button>
      </div>
    </div>
  )
}

/** Liste déroulante native, au même style que les champs. */
export function Select({ children, className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(classeChamp, 'h-10 py-1 [@media(pointer:coarse)]:h-11', className)} {...props}>{children}</select>
}

/** Champ nombre : vide = aucune valeur (null), sinon un entier. */
export function ChampNombre({ valeur, onChange, min = 0, max, ...props }: { valeur: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number } & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max'>) {
  return (
    <Input
      type="number" inputMode="numeric" min={min} max={max} step={1}
      value={valeur ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
      {...props}
    />
  )
}

/** Lecture d'une erreur d'enregistrement : le message du serveur, ou la première valeur refusée. */
export function messageErreur(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    const premier = detail[0] as { loc?: unknown[]; msg?: string }
    const champ = Array.isArray(premier.loc) ? String(premier.loc[premier.loc.length - 1] ?? '') : ''
    return `Une valeur n'est pas acceptée${champ ? ` (${champ})` : ''}${premier.msg ? ` : ${premier.msg}` : ''}.`
  }
  return "L'enregistrement n'a pas abouti. Réessayez dans un instant."
}

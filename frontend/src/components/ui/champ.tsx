import * as React from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Les champs du système (VEILLE-DESIGN P14). Une forme par rôle : saisie = rectangle de 14 px, 44 px de haut, trait de champ
 * (3:1) ; recherche = pilule. États : survol (trait plus marqué), focus (trait et contour d'accent), erreur (`aria-invalid`,
 * trait rouge et message qui nomme la correction), désactivé (glace, texte grisé). Au téléphone : 16 px (pas de zoom d'iOS).
 */
export const classeChamp = 'w-full rounded-lg border border-bord-champ bg-surface-0 px-3.5 text-sm text-fg transition-colors duration-fast ease-survol placeholder:text-fg-3 hover:border-fg-3 focus-visible:border-accent-ring aria-[invalid=true]:border-rouge-mark disabled:cursor-not-allowed disabled:border-bord-2 disabled:bg-surface-1 disabled:text-fg-disabled max-[768px]:text-saisie [@media(pointer:coarse)]:text-saisie'

export const Champ = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type ?? 'text'} className={cn(classeChamp, 'h-11', className)} {...props} />
))
Champ.displayName = 'Champ'

export const ZoneTexte = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(classeChamp, 'min-h-24 py-2.5 leading-normal', className)} {...props} />
))
ZoneTexte.displayName = 'ZoneTexte'

/** Recherche : la seule saisie en pilule, loupe à gauche. */
export const ChampRecherche = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'>>(({ className, ...props }, ref) => (
  <span className={cn('relative block', className)}>
    <Search aria-hidden size={18} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3" />
    <input ref={ref} type="search" className={cn(classeChamp, 'h-11 rounded-pilule pl-11')} {...props} />
  </span>
))
ChampRecherche.displayName = 'ChampRecherche'

/** « 12/03/2027 » ↔ « 2027-03-12 » ; null si la saisie n'est pas une date. */
export function dateDepuisSaisie(saisie: string): string | null {
  const m = saisie.trim().match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/)
  if (!m) return null
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(a, mo - 1, j)
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return null
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`
}
export const saisieDepuisDate = (iso: string | null | undefined): string => {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * Date : une saisie « jj/mm/aaaa » (aucun sélecteur natif, dont le format dépend du navigateur). `valeur` et `onChange` parlent
 * en AAAA-MM-JJ ; la saisie est vérifiée à la sortie du champ, et une date impossible le marque en erreur.
 */
export function ChampDate({ valeur, onChange, className, onBlur, ...props }: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  valeur: string | null | undefined
  onChange: (iso: string | null) => void
}) {
  const [saisie, setSaisie] = React.useState(saisieDepuisDate(valeur))
  const [fausse, setFausse] = React.useState(false)
  React.useEffect(() => { setSaisie(saisieDepuisDate(valeur)); setFausse(false) }, [valeur])
  return (
    <input
      type="text" inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa" maxLength={10}
      value={saisie}
      aria-invalid={fausse || props['aria-invalid'] || undefined}
      onChange={(e) => { setSaisie(e.target.value); setFausse(false) }}
      onBlur={(e) => {
        const texte = e.target.value.trim()
        const iso = texte ? dateDepuisSaisie(texte) : null
        setFausse(texte !== '' && iso === null)
        if (texte === '' || iso !== null) onChange(iso)
        onBlur?.(e)
      }}
      className={cn(classeChamp, 'chiffres h-11', className)}
      {...props}
    />
  )
}

/**
 * Nombre : une saisie numérique alignée à droite, chiffres tabulaires, sans les flèches du navigateur ; `unite` à droite du champ.
 * `valeur` et `onChange` parlent en nombre (null = vide) ; la virgule française est admise.
 */
export function ChampNombre({ valeur, onChange, unite, className, min, max, ...props }: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  valeur: number | null | undefined
  onChange: (n: number | null) => void
  unite?: string
  min?: number
  max?: number
}) {
  const [saisie, setSaisie] = React.useState(valeur == null ? '' : String(valeur).replace('.', ','))
  React.useEffect(() => { setSaisie((s) => (Number(s.replace(',', '.')) === valeur ? s : valeur == null ? '' : String(valeur).replace('.', ','))) }, [valeur])
  return (
    <span className={cn('relative block', className)}>
      <input
        type="text" inputMode="decimal" autoComplete="off"
        value={saisie}
        onChange={(e) => {
          const texte = e.target.value.replace(/[^\d,.\-]/g, '')
          setSaisie(texte)
          if (texte === '') return onChange(null)
          const n = Number(texte.replace(',', '.'))
          if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
          return undefined
        }}
        className={cn(classeChamp, 'chiffres h-11 text-right', unite && 'pr-12')}
        {...props}
      />
      {unite && <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-fg-3">{unite}</span>}
    </span>
  )
}

/**
 * Un champ et ce qui l'entoure : le libellé au-dessus (12,5 px / 500), une aide dessous (l'exemple, pas une consigne), et le
 * message d'erreur qui nomme la correction à faire, avec une icône. L'enfant reçoit `id`, `aria-describedby`, `aria-invalid`.
 */
export function GroupeChamp({ libelle, aide, erreur, facultatif, children, className }: {
  libelle: string
  aide?: React.ReactNode
  erreur?: React.ReactNode
  facultatif?: boolean
  children: React.ReactElement
  className?: string
}) {
  const id = React.useId()
  const decrit = [aide ? `${id}-aide` : null, erreur ? `${id}-erreur` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg-2">
        {libelle}{facultatif && <span className="font-normal text-fg-3"> (facultatif)</span>}
      </label>
      {React.cloneElement(children, { id, 'aria-describedby': decrit, 'aria-invalid': erreur ? true : children.props['aria-invalid'] })}
      {aide && !erreur && <p id={`${id}-aide`} className="text-xs text-fg-3">{aide}</p>}
      {erreur && (
        <p id={`${id}-erreur`} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rouge-ink">
          <AlertCircle aria-hidden size={14} strokeWidth={2} className="mt-px shrink-0" />{erreur}
        </p>
      )}
    </div>
  )
}

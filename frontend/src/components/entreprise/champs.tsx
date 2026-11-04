import { cloneElement, isValidElement, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, classeChamp } from '@/components/ui/input'
import { A_RENSEIGNER } from '@/lib/entreprise/synthese'

// Briques communes aux trois formulaires de « Mon entreprise » (reprises de l'ancien éditeur du profil).

// Boutons d'édition des listes (année, poste) : lien d'accent, retrait discret ; cibles 44 px au téléphone.
export const BOUTON_AJOUT = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11'
/** « Retirer » avec son mot, sous une carte de liste. */
export const BOUTON_RETIRER_TEXTE = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-fg-3 transition-colors duration-base ease-lien hover:text-danger [@media(pointer:coarse)]:min-h-11'
export const BOUTON_RETRAIT = 'grid size-9 shrink-0 place-items-center rounded-md text-fg-3 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-danger [@media(pointer:coarse)]:size-11'

/** Libellé de la rubrique Sirene : le nom, le SIRET, la forme juridique et le siège viennent du répertoire à l'inscription. */
export const SOURCE_SIRENE = 'Prérempli depuis le répertoire Sirene'

/**
 * Champ : l'étiquette est reliée au champ (id) ; `groupe` = plusieurs champs sous un même intitulé (pas de « for »).
 * `rempli` ajoute l'état du champ en petit sous lui : « Renseigné » (ou sa source), ou « À renseigner » en accent. Jamais de
 * rouge : un champ vide n'est pas une erreur. `aide` s'ajoute à cet état.
 */
export function Field({ label, aide, groupe, rempli, source, children }: { label: string; aide?: string; groupe?: boolean; rempli?: boolean; source?: string; children: React.ReactElement | React.ReactNode }) {
  const id = useId()
  const enfant = !groupe && isValidElement(children) ? cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children
  const Tete = groupe ? 'span' : 'label'
  return (
    <div className="min-w-0">
      <Tete {...(groupe ? {} : { htmlFor: id })} className="mb-1 block text-sm font-medium text-fg-2">{label}</Tete>
      {enfant}
      {rempli === undefined ? (
        aide && <p className="mt-1 text-xs text-fg-3">{aide}</p>
      ) : (
        <p data-etat={rempli ? 'rempli' : 'a-renseigner'} className="mt-1 text-xs text-fg-3">
          {rempli ? (source ?? 'Renseigné') : <span className="font-medium text-ambre-ink">{A_RENSEIGNER}</span>}
          {aide ? ` · ${aide}` : ''}
        </p>
      )}
    </div>
  )
}

/** Un bloc qui occupe les deux colonnes d'un groupe (liste, texte long, carte). */
export function Pleine({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 md:col-span-2">{children}</div>
}

/** Le reste d'un groupe, déplié à la demande : l'indispensable s'affiche d'abord. */
export function AfficherPlus({ libelle = 'Afficher les informations utiles et en option', libelleOuvert = 'Masquer les informations utiles et en option', children }: { libelle?: string; libelleOuvert?: string; children: React.ReactNode }) {
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
      {ouvert && <div id={id} className="mt-5 space-y-8">{children}</div>}
    </div>
  )
}

/** Un groupe de champs de la rubrique : sous-titre en capitales, champs en deux colonnes (une seule sous 768 px). */
export function Groupe({ titre, aide, children }: { titre: React.ReactNode; aide?: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-4">
      <div className="border-b border-bord-2 pb-2">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{titre}</h3>
        {aide && <p className="mt-1 text-xs text-fg-3">{aide}</p>}
      </div>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">{children}</div>
    </section>
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

import { cloneElement, isValidElement, useId, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { ChampNombre as ChampNombreSysteme } from '@/components/ui/champ'

// Briques communes aux trois formulaires de « Mon entreprise » : elles posent les composants du système (boutons, champs)
// dans la forme propre à ces formulaires (étiquette, aide, groupes, listes éditables).

/** « + Ajouter une ligne » : un lien, jamais un aplat (le seul bouton plein de l'écran est « Enregistrer »). */
export function BoutonAjout({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return <Bouton variante="lien" className={cn('text-sm', className)} onClick={onClick}><Plus aria-hidden />{children}</Bouton>
}

/** La corbeille d'une ligne : une icône seule, toujours nommée (« Retirer la ligne 2 de Matériel »). */
export function BoutonRetrait({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return <BoutonIcone libelle={libelle} onClick={onClick}><Trash2 aria-hidden strokeWidth={1.5} /></BoutonIcone>
}

/** « Retirer », avec son mot, sous un bloc de liste (qualification, référence). */
export function BoutonRetirer({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return <Bouton variante="discret" className="-ml-3 justify-self-start text-sm" aria-label={libelle} onClick={onClick}><Trash2 aria-hidden strokeWidth={1.5} />Retirer</Bouton>
}

/** Libellé de la rubrique Sirene : le nom, le SIRET, la forme juridique et le siège viennent du répertoire à l'inscription. */
export const SOURCE_SIRENE = 'Prérempli depuis le répertoire Sirene'

/**
 * Champ : l'étiquette est reliée au champ (id) ; `groupe` = plusieurs champs sous un même intitulé (pas de « for »).
 * Un champ vide est un champ à remplir : rien ne s'écrit dessous (plus de « À renseigner » ambre, l'ambre est gardé pour ce
 * qui est à surveiller). Un champ rempli par une source la nomme (`source`, ex. le répertoire Sirene) ; `aide` donne
 * l'exemple. `rempli` ne sert plus qu'à montrer la source.
 */
export function Field({ label, aide, groupe, rempli, source, children }: { label: string; aide?: string; groupe?: boolean; rempli?: boolean; source?: string; children: React.ReactElement | React.ReactNode }) {
  const id = useId()
  const enfant = !groupe && isValidElement(children) ? cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children
  const Tete = groupe ? 'span' : 'label'
  const dessous = [rempli && source ? source : null, aide].filter(Boolean).join(' · ')
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Tete {...(groupe ? {} : { htmlFor: id })} className={cn('block font-medium text-fg-2', groupe ? 'text-sm text-fg' : 'text-xs')}>{label}</Tete>
      {groupe && aide && <p className="-mt-1 text-sm text-fg-2">{aide}</p>}
      {enfant}
      {!groupe && dessous && <p className="text-xs text-fg-3">{dessous}</p>}
      {groupe && rempli && source && <p className="text-xs text-fg-3">{source}</p>}
    </div>
  )
}

/** Un bloc qui occupe les deux colonnes d'un groupe (liste, texte long). */
export function Pleine({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 md:col-span-2">{children}</div>
}

/** Le reste d'un groupe, déplié à la demande : l'indispensable s'affiche d'abord. */
export function AfficherPlus({ libelle = 'Afficher les informations utiles et en option', libelleOuvert = 'Masquer les informations utiles et en option', children }: { libelle?: string; libelleOuvert?: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const id = useId()
  return (
    <div>
      <Bouton variante="lien" className="text-sm" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-controls={id}>
        {ouvert ? libelleOuvert : libelle}
        <ChevronDown aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouvert && 'rotate-180')} />
      </Bouton>
      {ouvert && <div id={id} className="mt-5 grid gap-10">{children}</div>}
    </div>
  )
}

/** Un groupe de champs de la rubrique : son titre en casse de phrase, une ligne d'aide, les champs en deux colonnes (une sous 768 px). */
export function Groupe({ titre, aide, children }: { titre: React.ReactNode; aide?: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-4 border-b border-bord pb-3">
        <h3 id={id} className="text-base font-semibold text-fg">{titre}</h3>
        {aide && <p className="mt-1 text-sm text-fg-2">{aide}</p>}
      </div>
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">{children}</div>
    </section>
  )
}

/** Un bloc d'une liste éditable (un poste, une personne, une qualification, une référence) : un cadre fin sur le papier de la page. */
export const BLOC_LISTE = 'rounded-lg border border-bord bg-surface-0 p-4'

/** Champ nombre du système, en entier : vide = aucune valeur (null). */
export function ChampNombre({ valeur, onChange, min = 0, max, ...props }: { valeur: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number; unite?: string } & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'type'>) {
  return <ChampNombreSysteme valeur={valeur} min={min} max={max} onChange={(n) => onChange(n === null ? null : Math.trunc(n))} {...props} />
}

/** Lecture d'une erreur d'enregistrement : le message du serveur, ou la première valeur refusée. */
export function messageErreur(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    const premier = detail[0] as { loc?: unknown[]; msg?: string }
    const champ = Array.isArray(premier.loc) ? String(premier.loc[premier.loc.length - 1] ?? '') : ''
    return `Une valeur n’est pas acceptée${champ ? ` (${champ})` : ''}${premier.msg ? ` : ${premier.msg}` : ''}.`
  }
  return "L’enregistrement n’a pas abouti. Réessayez dans un instant."
}

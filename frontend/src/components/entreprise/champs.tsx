import { cloneElement, isValidElement, useId, useState } from 'react'
import { CheckCircle2, ChevronDown, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Briques communes aux trois formulaires de « Mon entreprise » (reprises de l'ancien éditeur du profil).

// Boutons d'édition des listes (année, poste) : lien d'accent, retrait discret ; cibles 44 px au téléphone.
export const BOUTON_AJOUT = 'inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11'
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

/** Barre d'enregistrement : un seul « Enregistrer » par rubrique, collé en bas de la zone de défilement. */
export function PiedEnregistrer({ enCours, reussi, erreur }: { enCours: boolean; reussi: boolean; erreur: string | null }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-bord-2 bg-[var(--glass-fill)] px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
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

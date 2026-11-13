import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Case de résumé (VEILLE-DESIGN P11, défaut 8 du fondateur). L'étiquette EN HAUT (13,5 px / 500), la valeur dessous :
 *  - un nombre supérieur à 0 : le gros chiffre, SEUL (`.chiffre-grand`) ; l'unité seulement si elle ajoute un sens
 *    (« à poser »), jamais l'étiquette répétée ;
 *  - rien à compter (0, null) : « Aucune » ou « Aucun » (`rien`), en texte, jamais un gros « 0 » ni l'étiquette redite ;
 *  - un texte (une date, un nom) : en 17 px / 600.
 * `precision` : une ligne dessous, qui dit autre chose. `action` : un lien en bas de la case.
 */
export function CaseResume({ etiquette, valeur, unite, rien = 'Aucun', precision, etat, action, children, className }: {
  etiquette: string
  valeur: number | string | null | undefined
  unite?: string
  rien?: 'Aucun' | 'Aucune'
  precision?: React.ReactNode
  /** Une pastille d'état, à droite de l'étiquette. */
  etat?: React.ReactNode
  action?: React.ReactNode
  /** Sous la valeur : une jauge, une désignation, une source. */
  children?: React.ReactNode
  className?: string
}) {
  const vide = valeur == null || valeur === 0 || valeur === ''
  const nombre = typeof valeur === 'number' && valeur > 0
  // garde-fou : la valeur ne redit jamais l'étiquette
  const texte = typeof valeur === 'string' ? valeur.replace(new RegExp(`\\s*${etiquette.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), ' ').trim() : ''
  return (
    <div data-case-resume="" className={cn('grid min-w-0 content-start gap-1.5 p-5', className)}>
      {/* la pastille ne passe jamais sur deux lignes : dans une case étroite (téléphone), elle se pose sous l'étiquette */}
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 max-md:flex-col max-md:items-start">
        <p data-etiquette="" className="text-sm font-medium text-fg-2">{etiquette}</p>
        {etat && <span data-etat-case="" className="shrink-0 [&>*]:whitespace-nowrap">{etat}</span>}
      </div>
      {vide
        ? <p data-valeur="rien" className="text-lg font-semibold text-fg-2">{rien}</p>
        : nombre
          ? <p data-valeur="nombre" className="flex items-baseline gap-2"><span className="chiffre-grand">{valeur}</span>{unite && <span className="text-sm text-fg-2">{unite}</span>}</p>
          : <p data-valeur="texte" className="min-w-0 break-words text-lg font-semibold text-fg">{texte || rien}</p>}
      {children}
      {precision && <p className="text-sm text-fg-2">{precision}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

/** La valeur d'une case ne compte rien : null, 0 ou un texte vide. */
const sansValeur = (valeur: unknown) => valeur == null || valeur === 0 || valeur === ''

/** Une case qui n'a rien à compter et rien d'autre à montrer (ni jauge ou source dessous, ni lien d'action). */
function caseSansRien(enfant: React.ReactNode): enfant is React.ReactElement<React.ComponentProps<typeof CaseResume>> {
  if (!React.isValidElement(enfant) || enfant.type !== CaseResume) return false
  const p = enfant.props as React.ComponentProps<typeof CaseResume>
  return sansValeur(p.valeur) && !p.action && React.Children.toArray(p.children).length === 0
}

/**
 * Une bande de cases : UNE surface, découpée par des filets de 1 px (jamais une grille de cartes identiques). Au téléphone,
 * deux colonnes (quatre cases tiennent en deux rangées au lieu de s'empiler sur 480 px) : filet vertical entre les deux
 * colonnes, filet horizontal entre les rangées ; une case seule sur sa rangée prend toute la largeur.
 *
 * La bande se resserre (jury, tour 1 : « quatre cases égales, dont deux “Aucun” », ce qui trahit le gabarit) : à partir de
 * DEUX cases qui n'ont rien à compter, elles quittent la surface et tiennent en une ligne de faits dessous
 * (« Remise sous 7 jours : aucune · À mettre à jour : aucun »). Une seule case sans valeur reste une case. Une case sans
 * valeur qui porte un lien d'action, une jauge ou une source reste une case : elle a quelque chose à montrer.
 */
const TEL_DEUX_COLONNES = 'max-md:grid-cols-2 max-md:[&>*]:border-bord max-md:[&>*:nth-child(odd):not(:last-child)]:border-r max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:last-child:nth-child(odd)]:col-span-2 max-md:[&>div]:p-4'

export function BandeCases({ children, libelle = 'Résumé', className }: { children: React.ReactNode; libelle?: string; className?: string }) {
  const tous = React.Children.toArray(children)
  const riens = tous.filter(caseSansRien)
  const resserree = riens.length >= 2
  const montres = resserree ? tous.filter((e) => !caseSansRien(e)) : tous
  const n = montres.length
  const faits = resserree && (
    <p data-cases-sans-rien="" className="text-sm text-fg-2">
      {riens.map((e) => `${e.props.etiquette}\u00a0: ${(e.props.rien ?? 'Aucun').toLowerCase()}`).join(' · ')}
    </p>
  )
  if (n === 0) return faits ? <div role="group" aria-label={libelle} className={className}>{faits}</div> : null
  const surface = (
    <div role="group" aria-label={libelle} data-bande-cases="" data-surface=""
      className={cn('grid divide-bord rounded-carte border border-bord bg-surface-0 shadow-card md:divide-x', n >= 2 ? TEL_DEUX_COLONNES : 'max-md:divide-y', n >= 4 ? 'md:grid-cols-4' : n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : '', resserree ? undefined : className)}>
      {montres}
    </div>
  )
  return faits ? <div data-bande-resserree="" className={cn('grid gap-3', className)}>{surface}{faits}</div> : surface
}

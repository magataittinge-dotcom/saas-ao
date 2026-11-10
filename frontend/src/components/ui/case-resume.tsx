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
      <div className="flex min-h-6 items-center justify-between gap-3">
        <p data-etiquette="" className="text-sm font-medium text-fg-2">{etiquette}</p>
        {etat}
      </div>
      {vide
        ? <p data-valeur="rien" className="text-lg font-semibold text-fg-2">{rien}</p>
        : nombre
          ? <p data-valeur="nombre" className="flex items-baseline gap-2"><span className="chiffre-grand">{valeur}</span>{unite && <span className="text-sm text-fg-2">{unite}</span>}</p>
          : <p data-valeur="texte" className="chiffres min-w-0 break-words text-lg font-semibold text-fg">{texte || rien}</p>}
      {children}
      {precision && <p className="text-sm text-fg-2">{precision}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

/**
 * Une bande de cases : UNE surface, découpée par des filets de 1 px (jamais une grille de cartes identiques). Au téléphone,
 * deux colonnes (quatre cases tiennent en deux rangées au lieu de s'empiler sur 480 px) : filet vertical entre les deux
 * colonnes, filet horizontal entre les rangées ; une case seule sur sa rangée prend toute la largeur.
 */
const TEL_DEUX_COLONNES = 'max-md:grid-cols-2 max-md:[&>*]:border-bord max-md:[&>*:nth-child(odd):not(:last-child)]:border-r max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:last-child:nth-child(odd)]:col-span-2 max-md:[&>div]:p-4'

export function BandeCases({ children, libelle = 'Résumé', className }: { children: React.ReactNode; libelle?: string; className?: string }) {
  const n = React.Children.count(children)
  const presentes = React.Children.toArray(children).length
  return (
    <div role="group" aria-label={libelle} data-bande-cases="" data-surface=""
      className={cn('grid divide-bord rounded-carte border border-bord bg-surface-0 shadow-card md:divide-x', presentes >= 2 ? TEL_DEUX_COLONNES : 'max-md:divide-y', n >= 4 ? 'md:grid-cols-4' : n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : '', className)}>
      {children}
    </div>
  )
}

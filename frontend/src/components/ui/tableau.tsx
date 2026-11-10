import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BoutonIcone } from './bouton'

export interface ColonneTableau<T> {
  cle: string
  /** Un nom court, en casse de phrase, sans ponctuation. */
  titre: string
  rendu: (ligne: T) => React.ReactNode
  /** Nombres et dates : à droite, en chiffres tabulaires. */
  nombre?: boolean
  /** Au téléphone, seule la première colonne et celles marquées `tel` restent (la rangée s'empile). */
  tel?: boolean
  classe?: string
}

export const LIGNES_PAR_PAGE = 50

/** « 1–50 sur 312 ». */
export const libellePage = (page: number, total: number, parPage = LIGNES_PAR_PAGE) =>
  `${Math.min(total, page * parPage + 1)}–${Math.min(total, (page + 1) * parPage)} sur ${total}`

/**
 * LE tableau du système (VEILLE-DESIGN P22, P23). Une surface à filets horizontaux de 1 px : aucun trait vertical, aucune
 * zébrure ; texte à gauche, nombres et dates à droite en chiffres tabulaires ; rangées de 52 px, cliquables entières
 * (`onLigne`) ; en-tête 12,5 px / 500 en casse de phrase, collant. 0 ligne : PAS de tableau, l'état vide (`vide`). Jusqu'à
 * 50 lignes : tout. Au-delà : pages de 50, « 1–50 sur 312 ». Une cellule sans objet : « — ». Au téléphone : une colonne,
 * chaque rangée s'empile (première colonne, puis les colonnes `tel`), rien ne défile de côté.
 */
export function Tableau<T>({ colonnes, lignes, cle, onLigne, vide, libelle, parPage = LIGNES_PAR_PAGE, className }: {
  colonnes: ColonneTableau<T>[]
  lignes: readonly T[]
  cle: (ligne: T) => string
  onLigne?: (ligne: T) => void
  /** Ce qui s'affiche à la place du tableau quand il n'y a aucune ligne (`<EtatVide>`). */
  vide: React.ReactNode
  /** Le nom du tableau pour les lecteurs d'écran. */
  libelle: string
  parPage?: number
  className?: string
}) {
  const [page, setPage] = React.useState(0)
  const pages = Math.max(1, Math.ceil(lignes.length / parPage))
  const courante = Math.min(page, pages - 1)
  if (lignes.length === 0) return <>{vide}</>
  const visibles = lignes.slice(courante * parPage, (courante + 1) * parPage)
  return (
    <div data-tableau="" data-surface="" className={cn('overflow-hidden rounded-carte border border-bord bg-surface-0 shadow-card', className)}>
      <table aria-label={libelle} className="w-full border-collapse text-sm">
        <thead className="max-md:sr-only">
          <tr>
            {colonnes.map((c) => (
              <th key={c.cle} scope="col" className={cn('sticky top-0 z-10 h-11 border-b border-bord bg-surface-0 px-4 text-xs font-medium text-fg-3', c.nombre ? 'text-right' : 'text-left', c.classe)}>{c.titre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map((ligne) => (
            <tr key={cle(ligne)} tabIndex={onLigne ? 0 : undefined}
              onClick={onLigne ? () => onLigne(ligne) : undefined}
              onKeyDown={onLigne ? (e) => { if (e.key === 'Enter') onLigne(ligne) } : undefined}
              className={cn('border-b border-bord last:border-b-0 max-md:grid max-md:gap-0.5 max-md:px-4 max-md:py-3', onLigne && 'cursor-pointer transition-colors duration-fast ease-survol hover:bg-surface-1 active:bg-surface-2')}>
              {colonnes.map((c, i) => (
                <td key={c.cle} data-nombre={c.nombre ? '' : undefined}
                  className={cn('h-[52px] px-4 py-2 align-middle text-fg max-md:h-auto max-md:p-0', c.nombre && 'chiffres text-right max-md:text-left', i > 0 && 'max-md:text-fg-2', i > 0 && !c.tel && 'max-md:hidden', c.classe)}>
                  {c.rendu(ligne) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-bord px-4 py-1.5">
          <p className="chiffres text-sm text-fg-2" aria-live="polite">{libellePage(courante, lignes.length, parPage)}</p>
          <div className="flex items-center gap-1">
            <BoutonIcone libelle="Page précédente" disabled={courante === 0} onClick={() => setPage(courante - 1)}><ChevronLeft aria-hidden strokeWidth={1.5} /></BoutonIcone>
            <BoutonIcone libelle="Page suivante" disabled={courante >= pages - 1} onClick={() => setPage(courante + 1)}><ChevronRight aria-hidden strokeWidth={1.5} /></BoutonIcone>
          </div>
        </div>
      )}
    </div>
  )
}

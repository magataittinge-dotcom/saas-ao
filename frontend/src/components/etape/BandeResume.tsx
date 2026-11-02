import { cn } from '@/lib/utils'
import type { SourceEtat } from './EtatElement'

export type EtatCarte = 'pret' | 'a-verifier' | 'neutre'

export interface CarteResume {
  libelle: string
  valeur: string
  /** Pastille d'état : « Prêt » ou « À vérifier ». « neutre » (par défaut) : aucune pastille. */
  etat?: EtatCarte
  /** Jauge : `rempli` sur `total`. */
  jauge?: { rempli: number; total: number }
  /** Une ligne d'explication, en petit sous la valeur. */
  detail?: string
  /** La source de la valeur dans le dossier : « Source : RC · page 4 » et « Voir dans le dossier ». */
  source?: SourceEtat
}

const PASTILLE: Record<Exclude<EtatCarte, 'neutre'>, { classe: string; texte: string }> = {
  pret: { classe: 'pill pill-conforme', texte: 'Prêt' },
  'a-verifier': { classe: 'pill pill-warning', texte: 'À vérifier' },
}

function Jauge({ libelle, rempli, total }: { libelle: string } & NonNullable<CarteResume['jauge']>) {
  const pct = total > 0 ? Math.min(100, Math.round((rempli / total) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(rempli, total)}
      className="h-1 overflow-hidden rounded-pilule bg-surface-2"
    >
      <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-morph ease-lien motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

function SourceCarte({ source }: { source: SourceEtat }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 border-t border-bord-2 pt-2 text-sm text-fg-2">
      <span>Source : {source.libelle}</span>
      {source.onVoir && (
        <button type="button" onClick={source.onVoir} className="inline-flex min-h-9 items-center rounded-xs font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11">
          Voir dans le dossier
        </button>
      )}
    </p>
  )
}

/**
 * Le résumé d'une étape : trois ou quatre cartes égales sur toute la largeur (une colonne au téléphone), comme les trois
 * rubriques de « Mon entreprise ». Chaque carte : un libellé, une valeur en grand, une pastille d'état, une jauge et une ligne
 * d'explication, tous facultatifs sauf libellé et valeur.
 */
export function BandeResume({ cartes, libelle = 'Résumé de l’étape', className }: { cartes: CarteResume[]; libelle?: string; className?: string }) {
  if (cartes.length === 0) return null
  const colonnes = cartes.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cartes.length === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <ul aria-label={libelle} data-bande-resume="" className={cn('grid items-stretch gap-3.5', colonnes, className)}>
      {cartes.map((c) => {
        const pastille = c.etat && c.etat !== 'neutre' ? PASTILLE[c.etat] : null
        return (
          <li key={c.libelle} data-carte-resume="" className="grid min-w-0 content-start gap-2 rounded-carte border border-bord-2 bg-surface-1 p-5">
            <div className="flex min-h-7 items-center justify-between gap-3">
              <p className="text-sm font-medium text-fg-2">{c.libelle}</p>
              {pastille && <span className={cn(pastille.classe, 'shrink-0')}>{pastille.texte}</span>}
            </div>
            <p className="min-w-0 break-words font-display text-h6 tabular-nums text-fg">{c.valeur}</p>
            {c.jauge && <Jauge libelle={c.libelle} {...c.jauge} />}
            {c.detail && <p className="text-sm text-fg-2">{c.detail}</p>}
            {c.source && <SourceCarte source={c.source} />}
          </li>
        )
      })}
    </ul>
  )
}

export default BandeResume

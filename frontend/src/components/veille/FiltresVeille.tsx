// Les filtres de la liste : délai, procédure, métier, mots-clés, tri. Chaque puce est un bouton à bascule
// (aria-pressed) ; le délai est un groupe radio. Les changements remontent tout de suite, sauf les mots-clés (400 ms).
import { useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DELAIS_JOURS, PROCEDURES_LIBELLES, basculerValeur, type FiltresAvis, type TriAvis } from '@/lib/veille'

export interface PropsFiltresVeille {
  filtres: FiltresAvis
  onFiltres: (p: Partial<FiltresAvis>) => void
  tri: TriAvis
  onTri: (t: TriAvis) => void
  metiers: readonly { code: string; libelle: string }[]
}

const puce = 'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-pilule border px-3 text-sm font-medium transition-colors duration-base ease-lien [@media(pointer:coarse)]:min-h-11'
const puceRepos = 'border-input bg-surface-0 text-fg hover:bg-surface-1'
const puceActive = 'border-accent-ui bg-accent-tint text-accent-text'

/** Champ de mots-clés : la saisie est locale, le filtre ne change qu'après 400 ms sans frappe. */
function ChampMotsCles({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(valeur)
  const id = useId()
  useEffect(() => { setLocal(valeur) }, [valeur])
  useEffect(() => {
    if (local === valeur) return
    const t = setTimeout(() => onChange(local.slice(0, 120)), 400)
    return () => clearTimeout(t)
  }, [local, valeur, onChange])
  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg-2">Mots-clés</label>
      <input
        id={id}
        type="search"
        value={local}
        maxLength={120}
        placeholder="école, façade, chaufferie…"
        onChange={(e) => setLocal(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-surface-0 px-3 text-[15px] text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ring [@media(pointer:coarse)]:min-h-11"
      />
    </div>
  )
}

export default function FiltresVeille({ filtres, onFiltres, tri, onTri, metiers }: PropsFiltresVeille) {
  const [metiersOuverts, setMetiersOuverts] = useState(false)
  const idPanneau = useId()
  const idTri = useId()
  return (
    <div className="space-y-3" role="group" aria-label="Filtres des avis">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p id={`${idPanneau}-delai`} className="mb-1.5 text-sm font-medium text-fg-2">Date limite dans</p>
          <div role="radiogroup" aria-labelledby={`${idPanneau}-delai`} className="flex flex-wrap gap-1.5">
            {DELAIS_JOURS.map((j) => (
              <button
                key={String(j)}
                type="button"
                role="radio"
                aria-checked={filtres.delai_jours === j}
                onClick={() => onFiltres({ delai_jours: j })}
                className={cn(puce, filtres.delai_jours === j ? puceActive : puceRepos)}
              >
                {j === null ? 'Toutes' : `${j} jours`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={idTri} className="text-sm font-medium text-fg-2">Trier par</label>
          <select
            id={idTri}
            value={tri}
            onChange={(e) => onTri(e.target.value as TriAvis)}
            className="h-10 rounded-md border border-input bg-surface-0 px-3 text-[15px] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ring [@media(pointer:coarse)]:min-h-11"
          >
            <option value="date_limite">Date limite</option>
            <option value="date_parution">Parution récente</option>
          </select>
        </div>
      </div>

      <div>
        <p id={`${idPanneau}-proc`} className="mb-1.5 text-sm font-medium text-fg-2">Procédure</p>
        <div role="group" aria-labelledby={`${idPanneau}-proc`} className="flex flex-wrap gap-1.5">
          {PROCEDURES_LIBELLES.map((p) => {
            const actif = filtres.procedures.includes(p.code)
            return (
              <button key={p.code} type="button" aria-pressed={actif} onClick={() => onFiltres({ procedures: basculerValeur(filtres.procedures, p.code) })}
                className={cn(puce, actif ? puceActive : puceRepos)}>
                {p.libelle}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <button
            type="button"
            aria-expanded={metiersOuverts}
            aria-controls={idPanneau}
            onClick={() => setMetiersOuverts((o) => !o)}
            className={cn(puce, 'gap-1.5', filtres.metiers.length ? puceActive : puceRepos)}
          >
            Métier{filtres.metiers.length > 0 && ` (${filtres.metiers.length})`}
            <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-base', metiersOuverts && 'rotate-180')} />
          </button>
        </div>
        <ChampMotsCles valeur={filtres.mots_cles} onChange={(v) => onFiltres({ mots_cles: v })} />
      </div>

      {metiersOuverts && (
        <div id={idPanneau} role="group" aria-label="Métiers" className="flex flex-wrap gap-1.5 rounded-lg bg-surface-1 p-3">
          {metiers.map((m) => {
            const actif = filtres.metiers.includes(m.code)
            return (
              <button key={m.code} type="button" aria-pressed={actif} onClick={() => onFiltres({ metiers: basculerValeur(filtres.metiers, m.code) })}
                className={cn(puce, actif ? puceActive : puceRepos)}>
                {m.libelle}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

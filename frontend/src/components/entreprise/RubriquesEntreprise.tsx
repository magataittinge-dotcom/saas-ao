import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LIBELLE_FICHE, lienFiche } from '@/lib/fiche'
import { RUBRIQUES, avancement, libelleAvancement, type DonneesEntreprise, type RubriqueId } from '@/lib/entreprise/avancement'
import { A_RENSEIGNER, faitsCles } from '@/lib/entreprise/synthese'

const LIEN_FICHE = 'relative z-10 inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xs text-sm font-semibold text-accent-text transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11'

function Barre({ rempli, total }: { rempli: number; total: number }) {
  return (
    <div aria-hidden="true" className="h-1 overflow-hidden rounded-pilule bg-surface-2">
      <div className="h-full rounded-pilule bg-accent-ui transition-[width] duration-morph ease-lien motion-reduce:transition-none" style={{ width: `${total ? Math.round((rempli / total) * 100) : 0}%` }} />
    </div>
  )
}

/**
 * Les trois rubriques : une rangée de trois cartes égales sur toute la largeur (une colonne au téléphone), puis le
 * formulaire de la rubrique choisie en pleine largeur dessous. Chaque carte : titre, numéro, jauge, quatre faits clés
 * (« À renseigner » en accent), nombre d'informations, lien « Fiche à télécharger ». La carte choisie a un bord accent.
 * Clavier : flèches gauche/droite (et haut/bas) déplacent le choix, Début et Fin vont aux extrémités, Entrée ou Espace choisit ;
 * `aria-selected` marque la carte choisie. Un seul formulaire est monté, celui de la rubrique choisie.
 */
export default function RubriquesEntreprise({ donnees, rubrique, onChoisir, panneaux }: {
  donnees: DonneesEntreprise
  rubrique: RubriqueId
  onChoisir: (id: RubriqueId) => void
  /** Le formulaire de chaque rubrique ; reçoit les identifiants d'accessibilité du panneau et de l'onglet. */
  panneaux: Record<RubriqueId, (ids: { panneau: string; onglet: string }) => ReactNode>
}) {
  const base = useId()
  const onglets = useRef<Record<string, HTMLButtonElement | null>>({})
  const idOnglet = (id: RubriqueId) => `${base}-${id}-onglet`
  const idPanneau = `${base}-panneau`

  const aller = (id: RubriqueId) => { onChoisir(id); onglets.current[id]?.focus() }
  const auClavier = (e: KeyboardEvent, i: number) => {
    const dernier = RUBRIQUES.length - 1
    const cible = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % RUBRIQUES.length
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + dernier) % RUBRIQUES.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? dernier : -1
    if (cible < 0) return
    e.preventDefault()
    aller(RUBRIQUES[cible].id)
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Les trois rubriques de Mon entreprise" className="grid items-stretch gap-3.5 md:grid-cols-3">
        {RUBRIQUES.map((r, i) => {
          const choisie = rubrique === r.id
          const av = avancement(donnees, r.id)
          const faits = faitsCles(donnees, r.id)
          return (
            <div
              key={r.id}
              role="presentation"
              data-rubrique={r.id}
              className={cn(
                'relative grid min-w-0 content-start gap-3 rounded-carte border bg-surface-1 p-5 transition-[border-color,box-shadow] duration-base ease-lien',
                choisie ? 'border-accent-ui shadow-[inset_0_0_0_1px_var(--accent-ui)]' : 'border-bord-2 hover:border-accent-ui/40',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  ref={(el) => { onglets.current[r.id] = el }}
                  type="button"
                  role="tab"
                  id={idOnglet(r.id)}
                  aria-selected={choisie}
                  aria-controls={idPanneau}
                  tabIndex={choisie ? 0 : -1}
                  onClick={() => onChoisir(r.id)}
                  onKeyDown={(e) => auClavier(e, i)}
                  className="rounded-xs text-left font-display text-lg font-semibold leading-tight text-fg after:absolute after:inset-0 after:rounded-carte after:content-['']"
                >
                  {r.titre}
                </button>
                <span aria-hidden="true" className="shrink-0 pt-1 text-xs tabular-nums tracking-[0.06em] text-fg-3">{`0${i + 1} / 0${RUBRIQUES.length}`}</span>
              </div>
              <Barre {...av} />
              <ul className="grid gap-1.5">
                {faits.map((f) => (
                  <li key={f.libelle} className="flex min-w-0 items-baseline justify-between gap-3 border-t border-bord-2 pt-1.5 text-sm">
                    <span className="shrink-0 text-fg-2">{f.libelle}</span>
                    <span className={cn('min-w-0 break-words text-right', f.valeur === null ? 'font-medium text-accent-text' : 'font-semibold tabular-nums text-fg')}>{f.valeur ?? A_RENSEIGNER}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm">
                <span className="text-fg-2">{libelleAvancement(av)}</span>
                <Link to={lienFiche(r.id)} className={LIEN_FICHE}>{LIBELLE_FICHE} <ArrowRight size={14} aria-hidden /></Link>
              </div>
            </div>
          )
        })}
      </div>
      {panneaux[rubrique]({ panneau: idPanneau, onglet: idOnglet(rubrique) })}
    </div>
  )
}

import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RUBRIQUES, avancement, libelleAvancement, type DonneesEntreprise, type RubriqueId } from '@/lib/entreprise/avancement'

/** La jauge d'une rubrique : un trait d'encre sur une piste neutre ; verte quand tout est renseigné. La largeur est calculée. */
function Jauge({ rempli, total }: { rempli: number; total: number }) {
  const complete = total > 0 && rempli >= total
  return (
    <span aria-hidden="true" className="block h-1.5 w-24 shrink-0 overflow-hidden rounded-pilule bg-surface-2 max-sm:hidden">
      <span className={cn('block h-full rounded-pilule transition-[width] duration-pop ease-survol motion-reduce:transition-none', complete ? 'bg-vert-mark' : 'bg-fg-2')} style={{ width: `${total ? Math.round((rempli / total) * 100) : 0}%` }} />
    </span>
  )
}

/**
 * Les trois rubriques : UNE surface, trois rangées (plus de trois cartes identiques). Chaque rangée dit le nom de la
 * rubrique, où elle en est (« 4 informations sur 9 ») et porte une jauge fine ; la rubrique ouverte est marquée (fond
 * neutre, chevron vers le bas), son formulaire s'ouvre dessous, sur toute la largeur. Un champ vide n'est pas une alerte :
 * aucun « À renseigner » ambre ici.
 * Clavier : flèches haut/bas (et gauche/droite) déplacent le choix, Début et Fin vont aux extrémités ; `aria-selected`
 * marque la rubrique ouverte. Un seul formulaire est monté, celui de la rubrique ouverte.
 * `scene` : là où les rangées se posent (à côté du visage et de la phrase de Synorix) ; sans `scene`, elles précèdent le formulaire.
 */
export default function RubriquesEntreprise({ donnees, rubrique, onChoisir, panneaux, scene }: {
  donnees: DonneesEntreprise
  rubrique: RubriqueId
  onChoisir: (id: RubriqueId) => void
  /** Le formulaire de chaque rubrique ; reçoit les identifiants d'accessibilité du panneau et de l'onglet. */
  panneaux: Record<RubriqueId, (ids: { panneau: string; onglet: string }) => ReactNode>
  scene?: (rangees: ReactNode) => ReactNode
}) {
  const base = useId()
  const onglets = useRef<Record<string, HTMLElement | null>>({})
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

  const rangees = (
    <div role="tablist" aria-orientation="vertical" aria-label="Les trois rubriques de Mon entreprise" data-surface=""
      className="overflow-hidden rounded-carte border border-bord bg-surface-0 shadow-card">
      {RUBRIQUES.map((r, i) => {
        const ouverte = rubrique === r.id
        const av = avancement(donnees, r.id)
        const complete = av.total > 0 && av.rempli >= av.total
        const Chevron = ouverte ? ChevronDown : ChevronRight
        return (
          <div
            key={r.id}
            ref={(el) => { onglets.current[r.id] = el }}
            role="tab"
            id={idOnglet(r.id)}
            data-rubrique={r.id}
            aria-selected={ouverte}
            aria-controls={idPanneau}
            tabIndex={ouverte ? 0 : -1}
            onClick={() => onChoisir(r.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoisir(r.id) } else auClavier(e, i) }}
            className={cn(
              'flex min-h-16 cursor-pointer items-center gap-4 border-t border-bord px-5 py-3 text-left transition-colors duration-fast ease-survol first:border-t-0 hover:bg-surface-1 sm:px-6',
              ouverte && 'bg-surface-1',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={cn('block text-base text-fg', ouverte ? 'font-semibold' : 'font-medium')}>{r.titre}</span>
              <span className={cn('flex items-center gap-1.5 text-sm', complete ? 'text-vert-ink' : 'text-fg-2')}>
                {complete && <Check aria-hidden size={14} strokeWidth={2} />}
                {/* rien de saisi : une phrase, jamais un zéro compté ni une barre vide */}
                <span>{av.rempli === 0 ? 'À commencer' : `${libelleAvancement(av)}${complete ? ' · complète' : ''}`}</span>
              </span>
            </span>
            {av.rempli > 0 && <Jauge {...av} />}
            <Chevron aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-3" />
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      {scene ? scene(rangees) : rangees}
      {panneaux[rubrique]({ panneau: idPanneau, onglet: idOnglet(rubrique) })}
    </>
  )
}

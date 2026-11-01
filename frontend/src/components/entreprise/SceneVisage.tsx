import { forwardRef, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useMedia } from '@/hooks/useMedia'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import type { DonneesEntreprise, RubriqueId } from '@/lib/entreprise/avancement'
import { boucleDoitTourner } from '@/lib/entreprise/fils'
import { doitJouer } from '@/lib/entreprise/visage'
import { A_RENSEIGNER, construireBulles, type Bulle } from '@/lib/entreprise/synthese'
import FilsVisage from './FilsVisage'
import VisageAnime, { type VisageAnimeRef } from './VisageAnime'
import { useALEcran, useOngletVisible } from './useVisibilite'

function BulleDonnee({ bulle, onChoisir, onChaud }: { bulle: Bulle; onChoisir: (b: Bulle) => void; onChaud: (id: string | null) => void }) {
  return (
    <button
      type="button"
      data-bulle={bulle.id}
      onClick={() => onChoisir(bulle)}
      onPointerEnter={() => onChaud(bulle.id)}
      onPointerLeave={() => onChaud(null)}
      onFocus={() => onChaud(bulle.id)}
      onBlur={() => onChaud(null)}
      className={cn(
        'group relative z-[2] grid min-h-11 min-w-0 gap-0.5 rounded-xl border border-bord-2 bg-surface-1 px-3.5 py-2.5 text-left shadow-card',
        'transition-[border-color,transform] duration-base ease-lien hover:-translate-y-px hover:border-accent-ui focus-visible:border-accent-ui motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'lg:w-full lg:max-w-[15.5rem]',
        bulle.cote === 'gauche' ? 'lg:self-end' : 'lg:self-start',
      )}
    >
      <span aria-hidden="true" className={cn('absolute top-1/2 hidden size-2 -translate-y-1/2 rounded-full bg-accent-ui shadow-[0_0_8px_var(--accent-ui)] lg:block', bulle.cote === 'gauche' ? '-right-[5px]' : '-left-[5px]')} />
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{bulle.libelle}</span>
      <span className={cn('text-sm font-semibold leading-tight', bulle.valeur === A_RENSEIGNER ? 'text-accent-text' : 'text-fg')}>{bulle.valeur}</span>
      <span className="text-xs text-fg-2">{bulle.detail}</span>
    </button>
  )
}

/**
 * Le haut de « Mon entreprise » : le visage de Synorix au centre, trois bulles de chaque côté, reliées par des fils.
 * Chaque bulle dit un fait de l'entreprise (données du profil) ; un clic ouvre la rubrique correspondante et le visage
 * joue l'éclair. Au téléphone : le visage, puis les six bulles en grille 2 × 3, sans fils ni canvas.
 */
const SceneVisage = forwardRef<VisageAnimeRef, {
  donnees: DonneesEntreprise
  onChoisir: (rubrique: RubriqueId) => void
}>(function SceneVisage({ donnees, onChoisir }, visageRef) {
  const scene = useRef<HTMLElement>(null)
  const boite = useRef<HTMLDivElement>(null)
  const mouvementReduit = useMouvementReduit()
  const large = useMedia('(min-width: 1024px)')
  const tactile = useMedia('(pointer: coarse)')
  const aLEcran = useALEcran(scene)
  const ongletVisible = useOngletVisible()
  const [chaud, setChaud] = useState<string | null>(null)
  const bulles = useMemo(() => construireBulles(donnees), [donnees])
  const gauche = bulles.filter((b) => b.cote === 'gauche')
  const droite = bulles.filter((b) => b.cote === 'droite')
  const joue = doitJouer({ mouvementReduit, aLEcran, ongletVisible })
  const choisir = (b: Bulle) => onChoisir(b.rubrique)
  const colonne = 'max-lg:contents lg:z-[2] lg:flex lg:flex-col lg:justify-between lg:gap-3.5 lg:py-4'

  return (
    <section
      ref={scene}
      aria-label="Le visage de Synorix et les informations de l'entreprise"
      className="relative grid grid-cols-2 gap-2.5 overflow-hidden lg:min-h-[420px] lg:grid-cols-[minmax(13.75rem,1fr)_300px_minmax(13.75rem,1fr)] lg:items-center lg:gap-x-3.5"
    >
      {large && (
        <FilsVisage scene={scene} visage={boite} bulles={bulles} chaud={chaud} tourne={boucleDoitTourner({ mouvementReduit, aLEcran, ongletVisible })} tactile={tactile} mouvementReduit={mouvementReduit} />
      )}
      <div className={cn(colonne, 'lg:items-end')}>
        {gauche.map((b) => <BulleDonnee key={b.id} bulle={b} onChoisir={choisir} onChaud={setChaud} />)}
      </div>
      <div ref={boite} className="relative z-[1] order-first col-span-2 lg:order-none lg:col-span-1">
        <VisageAnime ref={visageRef} actif={joue} />
      </div>
      <div className={cn(colonne, 'lg:items-start')}>
        {droite.map((b) => <BulleDonnee key={b.id} bulle={b} onChoisir={choisir} onChaud={setChaud} />)}
      </div>
    </section>
  )
})

export default SceneVisage

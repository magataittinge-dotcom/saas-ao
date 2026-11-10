import { forwardRef, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useMedia } from '@/hooks/useMedia'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import { Bouton } from '@/components/ui/bouton'
import type { DonneesEntreprise, RubriqueId } from '@/lib/entreprise/avancement'
import { doitJouer } from '@/lib/entreprise/visage'
import { REPOS, auRepos, lisser, normaliser, parallaxePermise, pose, transformation, type Normale } from '@/lib/entreprise/parallaxe'
import { voixSynorix } from '@/lib/entreprise/voix'
import VisageAnime, { type VisageAnimeRef } from './VisageAnime'
import { useALEcran, useOngletVisible } from './useVisibilite'

/**
 * Le haut de « Mon entreprise » : le visage de Synorix, à sa taille, à côté de la phrase qu'il dit (ce qu'il sait de
 * l'entreprise, puis la prochaine information utile et le geste pour la renseigner). Une fois sur l'écran : plus de bulles,
 * plus de fils. `children` : ce qui se pose sous la phrase (les trois rubriques). Au téléphone : le visage, la phrase, les rubriques.
 */
const SceneVisage = forwardRef<VisageAnimeRef, {
  donnees: DonneesEntreprise
  onChoisir: (rubrique: RubriqueId) => void
  children?: ReactNode
}>(function SceneVisage({ donnees, onChoisir, children }, visageRef) {
  const scene = useRef<HTMLElement>(null)
  const mouvementReduit = useMouvementReduit()
  const large = useMedia('(min-width: 1024px)')
  const tactile = useMedia('(pointer: coarse)')
  const aLEcran = useALEcran(scene)
  const ongletVisible = useOngletVisible()
  const joue = doitJouer({ mouvementReduit, aLEcran, ongletVisible })
  const voix = voixSynorix(donnees)

  // Parallaxe à la souris : le visage (calque `plan`) suit le pointeur, ±6 px et ≤ 2°, lissé par une petite boucle qui
  // s'arrête dès le retour au repos. Rien au toucher, au téléphone, hors écran ni en mouvement réduit (parallaxePermise).
  const plan = useRef<HTMLDivElement>(null)
  const cible = useRef<Normale>(REPOS)
  const courant = useRef<Normale>(REPOS)
  const raf = useRef(0)
  const permise = (pointerType: string) => parallaxePermise({ pointerType, mouvementReduit, tactile, large, actif: joue })
  const appliquer = (n: Normale) => {
    if (plan.current) plan.current.style.transform = transformation(pose(n))
  }
  const animer = () => {
    if (raf.current) return
    let avant = performance.now()
    const pas = (ms: number) => {
      courant.current = lisser(courant.current, cible.current, ms - avant)
      avant = ms
      if (auRepos(courant.current, cible.current)) {
        courant.current = cible.current
        appliquer(courant.current)
        raf.current = 0
        return
      }
      appliquer(courant.current)
      raf.current = requestAnimationFrame(pas)
    }
    raf.current = requestAnimationFrame(pas)
  }
  const surMouvement = (e: React.PointerEvent<HTMLElement>) => {
    if (!permise(e.pointerType) || !scene.current) return
    cible.current = normaliser(e.clientX, e.clientY, scene.current.getBoundingClientRect())
    animer()
  }
  const surSortie = () => {
    cible.current = REPOS
    animer()
  }
  // Mouvement réduit, passage au tactile, scène cachée : retour immédiat au repos, boucle arrêtée.
  useEffect(() => {
    if (permise('mouse')) return
    cancelAnimationFrame(raf.current)
    raf.current = 0
    cible.current = REPOS
    courant.current = REPOS
    appliquer(REPOS)
  }, [mouvementReduit, tactile, large, joue]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <section
      ref={scene}
      aria-label="Synorix et ce qu’il sait de votre entreprise"
      onPointerMove={surMouvement}
      onPointerLeave={surSortie}
      className="grid items-center gap-x-10 gap-y-6 lg:grid-cols-[300px_minmax(0,1fr)]"
    >
      <div className="lg:[perspective:900px]">
        <div ref={plan} data-plan-visage="">
          <VisageAnime ref={visageRef} actif={joue} />
        </div>
      </div>
      <div className="grid min-w-0 gap-6">
        <div>
          <p data-voix-synorix="" className="max-w-2xl text-xl font-semibold text-fg">{voix.phrase}</p>
          {voix.prochaine && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base text-fg-2">
              <span>{`Prochaine information utile\u00a0: «\u00a0${voix.prochaine.libelle}\u00a0».`}</span>
              <Bouton variante="lien" onClick={() => onChoisir(voix.prochaine!.rubrique)}>{`Ouvrir «\u00a0${voix.prochaine.titreRubrique}\u00a0»`}</Bouton>
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  )
})

export default SceneVisage

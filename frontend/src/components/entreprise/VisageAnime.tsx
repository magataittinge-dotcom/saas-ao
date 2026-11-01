import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import {
  CLIP, DEMARRAGE_MAX_MS, PAUSE_APRES_FONDU_MS, POSTER_FERME, POSTER_OUVERT, creerMachineVisage, sourcesClip,
  type ClipId, type DependancesVisage, type IssueClip, type MachineVisage,
} from '@/lib/entreprise/visage'

/** Ce que la page peut demander au visage. */
export interface VisageAnimeRef {
  /** Une rubrique, une bulle ou un enregistrement : le clip « éclair ». */
  eclair: () => void
}

// Le fond noir des clips : mélange « écran » en nuit (le noir disparaît), médaillon sombre derrière en clair.
// Le masque fond les bords du recadrage dans la page. En clair, le fondu est plus long (52 % → 82 %) et finit avec le
// médaillon : aucun anneau gris entre le bord du clip et celui du médaillon. En nuit, le masque d'origine (58 % → 80 %).
const MASQUE = cn(
  '[mask-image:radial-gradient(ellipse_54%_50%_at_50%_50%,#000_52%,transparent_82%)] [-webkit-mask-image:radial-gradient(ellipse_54%_50%_at_50%_50%,#000_52%,transparent_82%)]',
  'dark:[mask-image:radial-gradient(ellipse_54%_50%_at_50%_50%,#000_58%,transparent_80%)] dark:[-webkit-mask-image:radial-gradient(ellipse_54%_50%_at_50%_50%,#000_58%,transparent_80%)]',
)

// Médaillon du thème clair : dégradé long et adouci (paliers rapprochés, pas de bande visible), légèrement flouté.
// Il s'éteint à 82 %, comme le masque du clip en clair. Les paliers suivent une courbe douce plutôt qu'une rampe
// linéaire, qui laisse voir un anneau gris sur fond clair.
export const MEDAILLON_CLAIR = 'radial-gradient(ellipse 54% 50% at 50% 49%, var(--surface-dark) 0 46%, color-mix(in oklab, var(--surface-dark) 84%, transparent) 54%, color-mix(in oklab, var(--surface-dark) 58%, transparent) 62%, color-mix(in oklab, var(--surface-dark) 32%, transparent) 69%, color-mix(in oklab, var(--surface-dark) 13%, transparent) 75%, color-mix(in oklab, var(--surface-dark) 3%, transparent) 80%, transparent 82%)'
export const FLOU_MEDAILLON_PX = 6
const MEDIA = cn(
  'absolute inset-0 size-full object-cover opacity-0 transition-opacity [transition-duration:280ms] ease-out motion-reduce:transition-none data-[actif=true]:opacity-100 dark:mix-blend-screen',
  MASQUE,
)

/**
 * Le visage de Synorix : quatre clips muets joués l'un après l'autre (machine à états dans lib/entreprise/visage.ts).
 * Deux `<video>` superposées avec un fondu de 280 ms ; un clip terminé reste sur sa dernière image. `actif` dit si la
 * lecture est permise (scène à l'écran, onglet visible) ; mouvement réduit = le poster yeux ouverts, sans `<video>`.
 * Si la vidéo ne peut pas être lue, le poster yeux ouverts prend le relais.
 */
const VisageAnime = forwardRef<VisageAnimeRef, { actif: boolean; className?: string }>(function VisageAnime({ actif, className }, ref) {
  const reduit = useMouvementReduit()
  const posterRef = useRef<HTMLImageElement>(null)
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const machine = useRef<MachineVisage | null>(null)

  useImperativeHandle(ref, () => ({ eclair: () => machine.current?.interagir() }), [])

  useEffect(() => {
    const A = videoA.current
    const B = videoB.current
    const poster = posterRef.current
    if (reduit || !A || !B || !poster) return

    // Le clip 1 est déjà dans le balisage de A (préchargé) ; les autres sont posés à la demande.
    const chargee = new Map<HTMLVideoElement, ClipId | null>([[A, CLIP.ouvre], [B, null]])
    let courante: HTMLVideoElement | null = null
    let suivante: HTMLVideoElement = A
    let annulerLecture: (() => void) | null = null
    let minuterieBascule: number | undefined

    const poserSources = (v: HTMLVideoElement, clip: ClipId) => {
      v.replaceChildren(...sourcesClip(clip).map(({ src, type }) => Object.assign(document.createElement('source'), { src, type })))
      v.load()
    }

    const basculer = (v: HTMLVideoElement) => {
      v.dataset.actif = 'true'
      poster.dataset.actif = 'false'
      const ancienne = courante
      if (ancienne && ancienne !== v) {
        ancienne.dataset.actif = 'false'
        window.clearTimeout(minuterieBascule)
        minuterieBascule = window.setTimeout(() => { if (courante !== ancienne) ancienne.pause() }, PAUSE_APRES_FONDU_MS)
      }
      courante = v
      suivante = v === A ? B : A
    }

    const jouer = (clip: ClipId): Promise<IssueClip> => new Promise((resolve) => {
      const v = suivante
      window.clearTimeout(minuterieBascule)
      if (chargee.get(v) !== clip) { poserSources(v, clip); chargee.set(v, clip) }
      let termine = false
      const fin = (issue: IssueClip) => {
        if (termine) return
        termine = true
        v.removeEventListener('playing', enLecture)
        v.removeEventListener('ended', enFin)
        v.removeEventListener('error', enErreur, true)
        window.clearTimeout(garde)
        annulerLecture = null
        resolve(issue)
      }
      const enLecture = () => { window.clearTimeout(garde); basculer(v) }
      const enFin = () => { v.pause(); fin('fini') }
      // L'événement « error » d'un clip part de son dernier <source> (pas de la vidéo) : on l'écoute en capture, et on
      // ignore l'échec du mp4 tant que le webm n'a pas été essayé.
      const enErreur = (e: Event) => {
        const cible = e.target
        if (cible instanceof HTMLSourceElement && cible.nextElementSibling) return
        fin('echec')
      }
      const garde = window.setTimeout(() => fin('echec'), DEMARRAGE_MAX_MS)
      annulerLecture = () => { v.pause(); fin('interrompu') }
      v.addEventListener('playing', enLecture)
      v.addEventListener('ended', enFin)
      v.addEventListener('error', enErreur, true)
      try { v.currentTime = 0 } catch { /* pas encore de métadonnées : le clip part du début */ }
      v.play()?.catch(() => fin('echec'))
    })

    const dependances: DependancesVisage = {
      jouer,
      pauser: () => { A.pause(); B.pause(); annulerLecture?.() },
      surEchec: () => {
        A.pause(); B.pause()
        A.dataset.actif = 'false'; B.dataset.actif = 'false'
        poster.src = POSTER_OUVERT
        poster.dataset.actif = 'true'
      },
      poserMinuterie: (rappel, delai) => window.setTimeout(rappel, delai),
      annulerMinuterie: (m) => window.clearTimeout(m as number),
      maintenant: () => performance.now(),
      alea: Math.random,
    }
    const m = creerMachineVisage(dependances)
    machine.current = m

    // Un geste (souris, clavier, toucher) repousse la fermeture des yeux.
    const geste = () => m.activite()
    const evenements = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of evenements) document.addEventListener(e, geste, { passive: true })

    return () => {
      for (const e of evenements) document.removeEventListener(e, geste)
      window.clearTimeout(minuterieBascule)
      m.arreter()
      A.pause(); B.pause()
      machine.current = null
    }
  }, [reduit])

  useEffect(() => {
    if (reduit) return
    if (actif) machine.current?.reprendre()
    else machine.current?.suspendre()
  }, [actif, reduit])

  const [clip1mp4, clip1webm] = sourcesClip(CLIP.ouvre)

  return (
    <div data-visage="" className={cn('relative mx-auto h-[336px] w-[240px] lg:h-[420px] lg:w-[300px]', className)}>
      {/* médaillon sombre derrière le visage en thème clair ; en nuit, le mélange « écran » suffit */}
      <div aria-hidden="true" data-medaillon="" className="absolute inset-0 opacity-100 dark:opacity-0" style={{ background: MEDAILLON_CLAIR, filter: `blur(${FLOU_MEDAILLON_PX}px)` }} />
      {reduit ? (
        <img src={POSTER_OUVERT} alt="Le visage de Synorix" width={300} height={420} data-actif="true" className={MEDIA} />
      ) : (
        <>
          <img ref={posterRef} src={POSTER_FERME} alt="Le visage de Synorix" width={300} height={420} data-actif="true" className={MEDIA} />
          <video ref={videoA} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} className={MEDIA}>
            <source src={clip1mp4.src} type={clip1mp4.type} />
            <source src={clip1webm.src} type={clip1webm.type} />
          </video>
          <video ref={videoB} muted playsInline preload="none" aria-hidden="true" tabIndex={-1} className={MEDIA} />
        </>
      )}
    </div>
  )
})

export default VisageAnime

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useMedia } from '@/hooks/useMedia'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import { boucleDoitTourner, doitMonterEffets, POSITION_IMAGE } from '@/lib/entreprise/cerveau'

// Les effets (canvas, éclairs, étincelles) ne sont téléchargés que si la carte approche de l'écran
// et que le mouvement est permis.
const CerveauEffets = lazy(() => import('./CerveauEffets'))

export const IMAGE_CERVEAU = {
  petite: '/entreprise/cerveau-800.webp',
  grande: '/entreprise/cerveau-1600.webp',
} as const

/** Vrai tant que l'élément est dans la zone visible (marge 200 px pour précharger). Sans IntersectionObserver : vrai. */
function useALEcran(ref: React.RefObject<HTMLElement>): boolean {
  const [vu, setVu] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== 'function') { setVu(true); return }
    const io = new IntersectionObserver((es) => setVu(es[es.length - 1].isIntersecting), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return vu
}

function useOngletVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const maj = () => setVisible(document.visibilityState !== 'hidden')
    maj()
    document.addEventListener('visibilitychange', maj)
    return () => document.removeEventListener('visibilitychange', maj)
  }, [])
  return visible
}

/**
 * Le haut de « Mon entreprise » : une carte sombre (même en thème clair) avec le cerveau lumineux.
 * L'image est une photo WebP ; les effets sont un canvas chargé à la demande. Mouvement réduit = l'image seule.
 */
export default function CerveauEntreprise({ titre, sousTitre }: { titre: string; sousTitre: ReactNode }) {
  const carte = useRef<HTMLElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const mouvementReduit = useMouvementReduit()
  const tactile = useMedia('(pointer: coarse)')
  const aLEcran = useALEcran(carte)
  const ongletVisible = useOngletVisible()

  // Dès que la carte a été vue une fois, le module des effets reste monté (la boucle, elle, suit l'écran).
  const [demande, setDemande] = useState(false)
  useEffect(() => { if (doitMonterEffets({ mouvementReduit, aLEcran })) setDemande(true) }, [mouvementReduit, aLEcran])

  const effetsMontes = demande && !mouvementReduit

  return (
    // data-theme="dark" : la carte garde les jetons de la nuit (fond #111111, texte blanc) même en thème clair.
    <section
      ref={carte}
      data-theme="dark"
      className="relative isolate overflow-hidden rounded-carte border border-bord-2 bg-surface-0 shadow-card"
    >
      <div className="px-5 pb-1 pt-5 lg:absolute lg:left-8 lg:top-7 lg:z-10 lg:max-w-[14.5rem] lg:p-0">
        <h1 className="font-display text-h5 text-fg">{titre}</h1>
        <p className="mt-1.5 text-sm text-fg-2">{sousTitre}</p>
      </div>
      <div
        ref={scene}
        className="relative aspect-[4/3] overflow-hidden max-lg:[mask-image:linear-gradient(to_bottom,transparent,black_28%)] sm:aspect-[16/8] lg:aspect-[13/5] lg:max-h-[25rem] lg:w-full"
      >
        <img
          ref={image}
          src={IMAGE_CERVEAU.grande}
          srcSet={`${IMAGE_CERVEAU.petite} 800w, ${IMAGE_CERVEAU.grande} 1600w`}
          sizes="(min-width: 1024px) 1100px, 100vw"
          width={1600}
          height={893}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={cn('absolute inset-0 size-full object-cover', effetsMontes && 'will-change-transform')}
          style={{ objectPosition: `${POSITION_IMAGE.x * 100}% ${POSITION_IMAGE.y * 100}%` }}
        />
        {/* voile à gauche : le titre et le sous-titre gardent leur contraste sur le ciel étoilé (à partir de lg, où ils passent
            sur l'image). Opaque sous le texte (les particules passent dessous), fondu jusqu'à 48 % de la largeur. */}
        <div aria-hidden="true" data-voile className="pointer-events-none absolute inset-y-0 left-0 hidden w-[48%] bg-gradient-to-r from-surface-0 via-surface-0/80 to-transparent lg:block" />
        {effetsMontes && (
          <Suspense fallback={null}>
            <CerveauEffets scene={scene} zone={carte} image={image} tactile={tactile} tourne={boucleDoitTourner({ mouvementReduit, aLEcran, ongletVisible })} />
          </Suspense>
        )}
      </div>
    </section>
  )
}

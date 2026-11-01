import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { creerMoteur, type Moteur } from './moteurCerveau'

/**
 * Les effets du cerveau : un canvas posé sur l'image. Ce composant (et le moteur) est chargé à la demande,
 * quand la carte approche de l'écran ; il n'est jamais monté en mouvement réduit.
 */
export default function CerveauEffets({ scene, zone, image, tourne, tactile }: {
  scene: RefObject<HTMLElement>
  zone: RefObject<HTMLElement>
  image: RefObject<HTMLImageElement>
  /** La boucle d'images ne tourne que si la carte est à l'écran, l'onglet visible. */
  tourne: boolean
  tactile: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moteurRef = useRef<Moteur | null>(null)
  const tourneRef = useRef(tourne)
  tourneRef.current = tourne

  useEffect(() => {
    const canvas = canvasRef.current, laScene = scene.current
    if (!canvas || !laScene) return
    const moteur = creerMoteur({ canvas, scene: laScene, zone: zone.current ?? laScene, image: image.current, tactile })
    moteurRef.current = moteur
    moteur.regler(tourneRef.current)
    return () => { moteur.detruire(); moteurRef.current = null }
  }, [scene, zone, image, tactile])

  useEffect(() => { moteurRef.current?.regler(tourne) }, [tourne])

  return <canvas ref={canvasRef} aria-hidden="true" data-cerveau-effets="" className="pointer-events-none absolute inset-0 size-full" />
}

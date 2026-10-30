// Le visage du Compagnon : un nuage de points en WebGL, le poster en repli.
// - Le poster (deux images : yeux ouverts / fermés) s'affiche d'abord et reste seul si besoin :
//   mouvement réduit, pas de WebGL, WebGL logiciel, contexte perdu, fichier de points illisible.
// - Le moteur WebGL est un morceau à part (import dynamique) : il n'est téléchargé que si le visage
//   peut vraiment tourner et qu'il approche de l'écran.
// - 30 images/s au plus ; boucle arrêtée hors écran, onglet caché ; contexte libéré au démontage.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { doitCharger, raisonDuRepli, type RaisonRepli } from '@/lib/intelligence/cadence'
import { useMouvementReduit } from './useMouvementReduit'
import type { VisageMonte } from './moteurVisage'

export const URL_POINTS = '/visage/points.bin'
const POSTER_OUVERT = '/visage/tete-ouverte-poster.webp'
const POSTER_FERME = '/visage/tete-fermee-poster.webp'

export interface PropsVisage {
  /** Élément qui contient la scène ET les bulles (nœuds `.syx-noeud`, bulles `.syx-bulle`, dans l'ordre). */
  zoneRef: RefObject<HTMLElement>
  /** Ton de chaque bulle (`attention` = fil ambre). */
  tons: readonly string[]
  /** Bulle choisie (le visage tourne la tête et les yeux vers elle) ; -1 = aucune. */
  choix: number
  /** Accepte un WebGL rendu par le processeur : captures et mesures seulement. */
  accepterLogiciel?: boolean
  /** Prévient le parent du mode final (utile aux mesures et aux tests de bout en bout). */
  surMode?: (mode: 'poster' | 'webgl', raison: RaisonRepli | null) => void
}

export default function Visage({ zoneRef, tons, choix, accepterLogiciel = false, surMode }: PropsVisage) {
  const reduit = useMouvementReduit()
  const sceneRef = useRef<HTMLDivElement>(null)
  const pointsRef = useRef<HTMLCanvasElement>(null)
  const filsRef = useRef<HTMLCanvasElement>(null)
  const visageRef = useRef<VisageMonte | null>(null)
  const choixRef = useRef(choix)
  choixRef.current = choix
  const [mode, setMode] = useState<'poster' | 'webgl'>('poster')
  const surModeRef = useRef(surMode)
  surModeRef.current = surMode

  useEffect(() => {
    const scene = sceneRef.current
    const canvasPoints = pointsRef.current
    if (!scene || !canvasPoints) return
    const repli = (raison: RaisonRepli | null) => {
      setMode('poster')
      surModeRef.current?.('poster', raison)
    }
    if (!doitCharger({ mouvementReduit: reduit })) { repli('mouvement-reduit'); return }

    let annule = false
    let demarre = false
    const demarrer = async () => {
      if (demarre) return
      demarre = true
      try {
        const [moteur, reponse] = await Promise.all([
          import('./moteurVisage'),
          fetch(URL_POINTS).then((r) => { if (!r.ok) throw new Error('points'); return r.arrayBuffer() }),
        ])
        if (annule) return
        const zone = zoneRef.current
        const liste = (sel: string) => Array.from(zone?.querySelectorAll<HTMLElement>(sel) ?? [])
        const res = moteur.monterVisage({
          scene, canvasPoints, canvasFils: filsRef.current, donnees: reponse,
          puces: liste('.syx-noeud'), cibles: liste('.syx-bulle'), tons: [...tons], accepterLogiciel,
          surPremiereImage: () => { if (!annule) { setMode('webgl'); surModeRef.current?.('webgl', null) } },
          surPerte: () => { visageRef.current = null; repli(raisonDuRepli({ mouvementReduit: false, contextePerdu: true })) },
        })
        if (!res.visage) {
          repli(raisonDuRepli({
            mouvementReduit: false,
            webglIndisponible: res.erreur === 'pas-de-webgl',
            renduLogiciel: res.erreur === 'rendu-logiciel',
            pointsIllisibles: res.erreur === 'points-illisibles',
          }))
          return
        }
        visageRef.current = res.visage
        res.visage.choisir(choixRef.current)
      } catch {
        if (!annule) repli(raisonDuRepli({ mouvementReduit: false, pointsIllisibles: true }))
      }
    }
    // Pas de téléchargement tant que la scène n'approche pas de l'écran.
    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io?.disconnect(); void demarrer() } }, { rootMargin: '200px' })
      io.observe(scene)
    } else void demarrer()

    return () => {
      annule = true
      io?.disconnect()
      visageRef.current?.detruire() // libère aussi le contexte WebGL
      visageRef.current = null
      setMode('poster')
    }
    // `tons` change rarement (6 valeurs) : le visage est remonté s'il change.
  }, [reduit, accepterLogiciel, zoneRef, tons.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { visageRef.current?.choisir(choix) }, [choix])

  return (
    <div ref={sceneRef} className="syx-scene" data-mode={mode} data-reduit={reduit ? 'oui' : 'non'} aria-hidden="true">
      <div className="syx-grille" />
      <div className="syx-halo" />
      <img className="syx-repli" src={POSTER_OUVERT} alt="" width={640} height={640} decoding="async" />
      <img className="syx-repli syx-repli-ferme" src={POSTER_FERME} alt="" width={640} height={640} decoding="async" loading="lazy" />
      <canvas ref={pointsRef} className="syx-points" />
      <canvas ref={filsRef} className="syx-fils" />
    </div>
  )
}

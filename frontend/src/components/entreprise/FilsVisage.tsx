import { useEffect, useRef } from 'react'
import {
  courbe, creerParticules, faireRegulateur, hexAlpha, hexVersRvb, imagesParSeconde, opaciteParticule, pointSurCourbe, positionParticule,
  type Courbe, type Particule,
} from '@/lib/entreprise/fils'
import type { Bulle } from '@/lib/entreprise/synthese'

interface Fil { id: string; courbe: Courbe; particules: Particule[] }

const RVB_REPLI: [number, number, number] = [0, 120, 214]

function lireCouleurs(): { fil: [number, number, number]; particule: string; nuit: boolean } {
  const racine = document.documentElement
  const style = getComputedStyle(racine)
  const nuit = racine.getAttribute('data-theme') === 'dark'
  const fil = hexVersRvb(style.getPropertyValue('--accent-ui')) ?? RVB_REPLI
  const particule = (nuit ? style.getPropertyValue('--accent-200') : style.getPropertyValue('--accent-ui')).trim() || hexAlpha(fil, 1)
  return { fil, particule, nuit }
}

/**
 * Les fils de la scène : une courbe par bulle, du visage à la bulle, avec trois particules. Un canvas 2D posé sur toute
 * la scène (sans événement : les bulles restent cliquables). Il ne tourne que si `tourne` est vrai (à l'écran, onglet
 * visible, mouvement permis) : 60 images/s sur ordinateur, 30 sur écran tactile, 0 sinon. Sans mouvement, une seule
 * image immobile. Le fil de la bulle `chaud` (survol, focus) est plus lumineux.
 */
export default function FilsVisage({ scene, visage, bulles, chaud, tourne, tactile, mouvementReduit }: {
  scene: React.RefObject<HTMLElement>
  visage: React.RefObject<HTMLElement>
  bulles: Bulle[]
  chaud: string | null
  tourne: boolean
  tactile: boolean
  mouvementReduit: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chaudRef = useRef(chaud)
  chaudRef.current = chaud
  const dessiner = useRef<(ms: number, fixe: boolean) => void>(() => {})
  const bullesRef = useRef(bulles)
  const signature = bulles.map((b) => `${b.id}:${b.valeur}:${b.detail}`).join('|')
  bullesRef.current = bulles

  // Géométrie, couleurs et dessin : refaits quand la scène change de taille ou de thème.
  useEffect(() => {
    const cv = canvas.current
    const zone = scene.current
    const boite = visage.current
    const ctx = cv?.getContext('2d')
    if (!cv || !zone || !boite || !ctx) return
    let fils: Fil[] = []
    let dpr = 1
    let couleurs = lireCouleurs()

    const mesurer = () => {
      const r = zone.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      const ir = boite.getBoundingClientRect()
      fils = bullesRef.current.flatMap((b, i) => {
        const el = zone.querySelector<HTMLElement>(`[data-bulle="${b.id}"]`)
        if (!el) return []
        const br = el.getBoundingClientRect()
        const p0 = { x: (ir.left - r.left + ir.width * b.ancre.x) * dpr, y: (ir.top - r.top + ir.height * b.ancre.y) * dpr }
        const p3 = { x: ((b.cote === 'gauche' ? br.right : br.left) - r.left) * dpr, y: (br.top - r.top + br.height / 2) * dpr }
        return [{ id: b.id, courbe: courbe(p0, p3), particules: creerParticules(i) }]
      })
    }

    dessiner.current = (ms, fixe) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.lineCap = 'round'
      for (const f of fils) {
        const chauffe = chaudRef.current === f.id
        const { p0, c1, c2, p3 } = f.courbe
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y)
        const degrade = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y)
        degrade.addColorStop(0, hexAlpha(couleurs.fil, chauffe ? 0.9 : 0.5))
        degrade.addColorStop(1, hexAlpha(couleurs.fil, chauffe ? 0.6 : 0.16))
        ctx.strokeStyle = degrade
        ctx.lineWidth = (chauffe ? 1.6 : 1) * dpr
        ctx.stroke()
        for (const p of f.particules) {
          const t = positionParticule(p, ms, fixe)
          const q = pointSurCourbe(f.courbe, t)
          ctx.globalAlpha = opaciteParticule(t) * (chauffe ? 1 : 0.85)
          ctx.fillStyle = couleurs.particule
          ctx.shadowBlur = (couleurs.nuit ? 10 : 6) * dpr
          ctx.shadowColor = couleurs.particule
          ctx.beginPath()
          ctx.arc(q.x, q.y, (chauffe ? 2.4 : 1.8) * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      }
    }

    let delai = 0
    const refaire = () => { mesurer(); dessiner.current(performance.now(), true) }
    refaire()
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { window.clearTimeout(delai); delai = window.setTimeout(refaire, 80) })
    observateur?.observe(zone)
    zone.querySelectorAll('[data-bulle]').forEach((el) => observateur?.observe(el))
    const theme = new MutationObserver(() => { couleurs = lireCouleurs(); dessiner.current(performance.now(), true) })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    return () => { window.clearTimeout(delai); observateur?.disconnect(); theme.disconnect(); dessiner.current = () => {} }
  }, [scene, visage, signature])

  // La boucle : seulement quand la scène est à l'écran, l'onglet visible et le mouvement permis.
  useEffect(() => {
    if (!tourne) { dessiner.current(performance.now(), true); return }
    const regulateur = faireRegulateur(imagesParSeconde(tactile))
    let raf = 0
    const boucle = (ms: number) => {
      if (regulateur(ms)) dessiner.current(ms, false)
      raf = requestAnimationFrame(boucle)
    }
    raf = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(raf)
  }, [tourne, tactile])

  // Une bulle survolée, ou le mouvement coupé : une image immobile suffit à montrer le fil éclairé.
  useEffect(() => { if (!tourne || mouvementReduit) dessiner.current(performance.now(), true) }, [chaud, tourne, mouvementReduit])

  return <canvas ref={canvas} aria-hidden="true" data-fils="" className="pointer-events-none absolute inset-0 size-full" />
}

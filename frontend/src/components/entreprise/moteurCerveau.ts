// Mon entreprise — moteur des effets du cerveau (canvas 2D posé sur l'image). Chargé à la demande :
// jamais importé directement par la page, seulement par CerveauEffets (React.lazy).
// Mécanique reprise de la maquette « cerveau » : étincelles qui scintillent, éclairs qui tremblent à gauche
// et à droite, lueur qui respire, balayage lumineux, parallaxe à la souris. Aucune image calculée hors écran :
// la boucle est pilotée de l'extérieur (regler) et s'arrête d'elle-même.
import {
  BLEU_REPLI, PARALLAXE, REPERES, IMAGE, TREMBLEMENT_MS,
  cadrageCover, eclaircir, eclatEtincelle, faireAlea, faireEclair, faireEtincelles, faireRegulateur,
  imagesParSeconde, lireRvb, pointDansBoite, positionBalayage, positionSouris, respiration, rgba, suivre,
  type Eclair, type Rvb,
} from '@/lib/entreprise/cerveau'

export interface OptionsMoteur {
  canvas: HTMLCanvasElement
  /** La boîte de l'image (le canvas la recouvre). */
  scene: HTMLElement
  /** La zone qui écoute la souris (la carte entière). */
  zone: HTMLElement
  /** L'image : la parallaxe la déplace par transform (composition sur le processeur graphique, pas de recalcul de mise en page). */
  image: HTMLImageElement | null
  /** Écran tactile : 30 images/s, moins d'étincelles. */
  tactile: boolean
}

export interface Moteur {
  /** Démarre ou arrête la boucle d'images. */
  regler: (tourne: boolean) => void
  detruire: () => void
}

export function creerMoteur(o: OptionsMoteur): Moteur {
  const ctx = o.canvas.getContext('2d')
  const alea = faireAlea(7)
  const etincelles = faireEtincelles(o.tactile ? 90 : 170, alea)
  const regulateur = faireRegulateur(imagesParSeconde(o.tactile))

  let w = 1, h = 1, dpr = 1
  let cadrage = cadrageCover(1, 1)
  let bleu: Rvb = BLEU_REPLI
  let clair: Rvb = eclaircir(BLEU_REPLI, 0.7)
  const souris = { tx: 0, ty: 0, x: 0, y: 0 }
  const eclairs: { g: Eclair | null; d: Eclair | null; t: number; a: number } = { g: null, d: null, t: -Infinity, a: 1 }
  let raf = 0, tourne = false, dernier = 0, detruit = false

  function lirePalette() {
    const lu = lireRvb(getComputedStyle(o.scene).getPropertyValue('--accent-500'))
    bleu = lu ?? BLEU_REPLI
    clair = eclaircir(bleu, 0.7)
  }

  function taille() {
    const r = o.scene.getBoundingClientRect()
    w = Math.max(1, r.width); h = Math.max(1, r.height)
    dpr = Math.min(o.tactile ? 1.5 : 2, window.devicePixelRatio || 1)
    o.canvas.width = Math.round(w * dpr); o.canvas.height = Math.round(h * dpr)
    cadrage = cadrageCover(w, h)
    eclairs.t = -Infinity // nouveaux éclairs aux bonnes positions
    lirePalette()
  }

  /** Repère de l'image → position dans la boîte, en suivant l'agrandissement et le décalage de la parallaxe. */
  function place(u: number, v: number, decalX: number, decalY: number) {
    const p = pointDansBoite(cadrage, u, v)
    return { x: w / 2 + (p.x - w / 2) * PARALLAXE.zoom + decalX, y: h / 2 + (p.y - h / 2) * PARALLAXE.zoom + decalY }
  }

  function dessiner(t: number, dt: number) {
    if (!ctx) return
    souris.x = suivre(souris.x, souris.tx, dt); souris.y = suivre(souris.y, souris.ty, dt)
    const dx = souris.x * PARALLAXE.x, dy = souris.y * PARALLAXE.y
    if (o.image) o.image.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0) scale(${PARALLAXE.zoom})`

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'

    const c = place(REPERES.centre.u, REPERES.centre.v, dx, dy)
    const rx = 0.27 * IMAGE.largeur * cadrage.echelle * PARALLAXE.zoom
    const ry = 0.37 * IMAGE.hauteur * cadrage.echelle * PARALLAXE.zoom

    // lueur qui respire
    const R = Math.max(rx, ry) * 1.25
    const lueur = ctx.createRadialGradient(c.x, c.y, R * 0.1, c.x, c.y, R)
    lueur.addColorStop(0, rgba(bleu, 0.1 + 0.08 * respiration(t)))
    lueur.addColorStop(1, rgba(bleu, 0))
    ctx.fillStyle = lueur
    ctx.fillRect(0, 0, w, h)

    // balayage lumineux : une bande douce qui traverse le cerveau, de gauche à droite
    ctx.save()
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.clip()
    const sx = c.x - rx + 2 * rx * positionBalayage(t)
    const demi = Math.max(24, rx * 0.22)
    const bande = ctx.createLinearGradient(sx - demi, 0, sx + demi, 0)
    bande.addColorStop(0, rgba(clair, 0)); bande.addColorStop(0.5, rgba(clair, 0.16)); bande.addColorStop(1, rgba(clair, 0))
    ctx.fillStyle = bande
    ctx.fillRect(sx - demi, c.y - ry, demi * 2, ry * 2)
    ctx.restore()

    // éclairs : nouveaux tracés toutes les 110 ms, à gauche et à droite du cerveau
    if (t - eclairs.t > TREMBLEMENT_MS) {
      eclairs.t = t
      const g = place(REPERES.bordGauche.u, REPERES.bordGauche.v, dx, dy)
      const d = place(REPERES.bordDroit.u, REPERES.bordDroit.v, dx, dy)
      eclairs.g = faireEclair(g.x, g.y, -10, g.y + (alea() - 0.5) * h * 0.25, 0.42, alea)
      eclairs.d = faireEclair(d.x, d.y, w + 10, d.y + (alea() - 0.5) * h * 0.25, 0.42, alea)
      eclairs.a = 0.65 + alea() * 0.35
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const e of [eclairs.g, eclairs.d]) if (e) tracerEclair(e)

    // étincelles
    ctx.fillStyle = rgba(clair, 1)
    for (const s of etincelles) {
      const p = place(s.u, s.v + Math.sin(t / 4000 + s.phase) * 0.004, dx * 1.4, dy * 1.4)
      ctx.globalAlpha = eclatEtincelle(s, t)
      ctx.fillRect(p.x - s.rayon, p.y - s.rayon, s.rayon * 2, s.rayon * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  function tracerEclair(e: Eclair) {
    if (!ctx) return
    const trait = (pts: [number, number][], largeur: number, alpha: number) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.strokeStyle = rgba(clair, alpha * eclairs.a); ctx.lineWidth = largeur; ctx.stroke()
    }
    trait(e.principal, 6, 0.12); trait(e.principal, 1.4, 0.9)
    for (const b of e.branches) { trait(b, 3, 0.08); trait(b, 0.9, 0.55) }
  }

  function boucle(now: number) {
    raf = requestAnimationFrame(boucle)
    if (!regulateur(now)) return // plafond de cadence : on saute les rafraîchissements en trop
    const dt = dernier ? now - dernier : 16
    dernier = now
    dessiner(now, dt)
  }

  function regler(veut: boolean) {
    if (detruit || veut === tourne) return
    tourne = veut
    if (veut) { dernier = 0; raf = requestAnimationFrame(boucle) } else cancelAnimationFrame(raf)
  }

  // souris : la parallaxe suit le pointeur ; au doigt, rien (le défilement ne doit pas faire bouger l'image)
  const surSouris = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const r = o.scene.getBoundingClientRect()
    const p = positionSouris(e.clientX, e.clientY, r.left, r.top, r.width, r.height)
    souris.tx = p.x; souris.ty = p.y
  }
  const surSortie = () => { souris.tx = 0; souris.ty = 0 }
  o.zone.addEventListener('pointermove', surSouris, { passive: true })
  o.zone.addEventListener('pointerleave', surSortie, { passive: true })

  taille()
  let delai = 0
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(delai); delai = window.setTimeout(taille, 120) }) : null
  ro?.observe(o.scene)

  return {
    regler,
    detruire() {
      detruit = true
      cancelAnimationFrame(raf); clearTimeout(delai)
      ro?.disconnect()
      o.zone.removeEventListener('pointermove', surSouris)
      o.zone.removeEventListener('pointerleave', surSortie)
      if (o.image) o.image.style.transform = ''
    },
  }
}

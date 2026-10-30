// Visage du Compagnon — moteur WebGL 1 sans bibliothèque (un programme, deux tampons, un appel de dessin).
// Chargé À LA DEMANDE (import dynamique depuis Visage.tsx) : il ne pèse pas sur le morceau du tableau de bord.
// Portage TypeScript du module mesuré le 25/10 (0,39 ms de script par image, processeur ralenti 6 fois).
import { decoderPoints, type DonneesVisage } from '@/lib/intelligence/points'
import { boucleDoitTourner, faireRegulateur, IMAGES_PAR_SECONDE_MAX } from '@/lib/intelligence/cadence'
import {
  AMBRE_REPLI, BLEU_ACCENT_REPLI, estNuit, lireCouleur, paletteDepuisAccent, type PaletteVisage, type Rvb,
} from '@/lib/intelligence/palette'

/* ───────────────────────── Shaders (GLSL ES 1.0) ───────────────────────── */

const VERTEX = `
attribute vec3 aPos;
attribute vec4 aAtt;
uniform mat4 uProj;
uniform mat3 uRot;
uniform float uDist, uTime, uBlink, uScanY, uScanAmt, uPx;
uniform vec2 uGaze;
varying float vB;
void main() {
  vec3 p = aPos;
  float ph = fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  p.xy += uGaze * aAtt.w * vec2(0.034, 0.024);
  p.z += 0.010 * sin(uTime * 1.2 + ph);
  vec3 r = uRot * p;
  float zc = r.z - uDist;
  gl_Position = uProj * vec4(r.xy, zc, 1.0);
  float b = mix(aAtt.x, aAtt.y, uBlink);
  float tw = 0.82 + 0.18 * sin(uTime * (0.9 + ph * 0.37) + ph * 7.0);
  float dy = (p.y - uScanY) / 0.05;
  float scan = uScanAmt * exp(-dy * dy);
  vB = clamp(b * tw + scan * (0.22 + b), 0.0, 1.0);
  gl_PointSize = uPx * (0.65 + aAtt.z * 0.85) * (0.60 + vB) * (uDist / -zc);
}`

const FRAGMENT = `
precision mediump float;
varying float vB;
uniform vec3 uDeep, uMid, uIce, uPeak;
uniform float uGain, uBase;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float soft = 1.0 - smoothstep(0.0, 1.0, d);
  soft = soft * sqrt(soft);
  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.38, vB));
  col = mix(col, uIce, smoothstep(0.30, 0.78, vB));
  col = mix(col, uPeak, smoothstep(0.90, 1.0, vB));
  float a = (uBase + (1.0 - uBase) * vB) * soft * uGain;
  gl_FragColor = vec4(col * a, a);
}`

/* ───────────────────────── Rendu WebGL ───────────────────────── */

interface Uniformes {
  uProj: Float32Array; uRot: Float32Array; uDist: number; uTime: number; uBlink: number
  uScanY: number; uScanAmt: number; uPx: number; uGaze: Float32Array
}

interface Rendu {
  gl: WebGLRenderingContext
  taille(w: number, h: number): void
  palette(p: PaletteVisage): void
  dessiner(u: Uniformes): void
  detruire(): void
}

const NOMS_UNIFORMES = ['uProj', 'uRot', 'uDist', 'uTime', 'uBlink', 'uScanY', 'uScanAmt', 'uPx', 'uGaze', 'uDeep', 'uMid', 'uIce', 'uPeak', 'uGain', 'uBase'] as const

function creerRendu(canvas: HTMLCanvasElement, d: DonneesVisage): Rendu | null {
  let gl: WebGLRenderingContext | null = null
  try {
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'low-power' })
  } catch { gl = null }
  if (!gl) return null
  const ctx = gl
  const compiler = (type: number, src: string) => {
    const s = ctx.createShader(type)!
    ctx.shaderSource(s, src)
    ctx.compileShader(s)
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(s) || 'shader')
    return s
  }
  const prog = ctx.createProgram()!
  ctx.attachShader(prog, compiler(ctx.VERTEX_SHADER, VERTEX))
  ctx.attachShader(prog, compiler(ctx.FRAGMENT_SHADER, FRAGMENT))
  ctx.linkProgram(prog)
  if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(prog) || 'link')
  const U = {} as Record<(typeof NOMS_UNIFORMES)[number], WebGLUniformLocation | null>
  for (const k of NOMS_UNIFORMES) U[k] = ctx.getUniformLocation(prog, k)
  const aPos = ctx.getAttribLocation(prog, 'aPos')
  const aAtt = ctx.getAttribLocation(prog, 'aAtt')
  const bPos = ctx.createBuffer()
  ctx.bindBuffer(ctx.ARRAY_BUFFER, bPos)
  ctx.bufferData(ctx.ARRAY_BUFFER, d.pos, ctx.STATIC_DRAW)
  const bAtt = ctx.createBuffer()
  ctx.bindBuffer(ctx.ARRAY_BUFFER, bAtt)
  ctx.bufferData(ctx.ARRAY_BUFFER, d.att, ctx.STATIC_DRAW)
  ctx.useProgram(prog)
  ctx.bindBuffer(ctx.ARRAY_BUFFER, bPos)
  ctx.enableVertexAttribArray(aPos)
  ctx.vertexAttribPointer(aPos, 3, ctx.FLOAT, false, 0, 0)
  ctx.bindBuffer(ctx.ARRAY_BUFFER, bAtt)
  ctx.enableVertexAttribArray(aAtt)
  ctx.vertexAttribPointer(aAtt, 4, ctx.UNSIGNED_BYTE, true, 0, 0)
  ctx.disable(ctx.DEPTH_TEST)
  ctx.enable(ctx.BLEND)
  ctx.clearColor(0, 0, 0, 0)
  let courante: PaletteVisage | null = null

  return {
    gl: ctx,
    taille(w, h) { canvas.width = w; canvas.height = h; ctx.viewport(0, 0, w, h) },
    palette(p) {
      courante = p
      ctx.blendFunc(ctx.ONE, p.additif ? ctx.ONE : ctx.ONE_MINUS_SRC_ALPHA)
      ctx.uniform3fv(U.uDeep, p.deep); ctx.uniform3fv(U.uMid, p.mid)
      ctx.uniform3fv(U.uIce, p.ice); ctx.uniform3fv(U.uPeak, p.peak)
      ctx.uniform1f(U.uGain, p.gain); ctx.uniform1f(U.uBase, p.base)
    },
    dessiner(u) {
      ctx.clear(ctx.COLOR_BUFFER_BIT)
      ctx.uniformMatrix4fv(U.uProj, false, u.uProj)
      ctx.uniformMatrix3fv(U.uRot, false, u.uRot)
      ctx.uniform1f(U.uDist, u.uDist); ctx.uniform1f(U.uTime, u.uTime)
      ctx.uniform1f(U.uBlink, u.uBlink); ctx.uniform1f(U.uScanY, u.uScanY)
      ctx.uniform1f(U.uScanAmt, u.uScanAmt); ctx.uniform1f(U.uPx, u.uPx * (courante?.taille ?? 1))
      ctx.uniform2fv(U.uGaze, u.uGaze)
      ctx.drawArrays(ctx.POINTS, 0, d.n)
    },
    detruire() {
      ctx.deleteBuffer(bPos); ctx.deleteBuffer(bAtt); ctx.deleteProgram(prog)
      ctx.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/** Vrai si le WebGL est rendu par le processeur (pas de carte graphique utilisable). */
export function estLogiciel(gl: WebGLRenderingContext): boolean {
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const nom = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(nom))
}

/* ───────────────────────── Couleurs lues dans les variables CSS ───────────────────────── */

let sonde: CanvasRenderingContext2D | null | undefined

/** Résout n'importe quelle couleur CSS (hex, rgb, oklch…) en RVB 0..1 via un canvas 1×1. */
function resoudre(couleurCss: string): Rvb | null {
  if (sonde === undefined) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    sonde = c.getContext('2d', { willReadFrequently: true })
  }
  if (!sonde || !couleurCss) return null
  sonde.clearRect(0, 0, 1, 1)
  sonde.fillStyle = 'black'
  sonde.fillStyle = couleurCss
  sonde.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = sonde.getImageData(0, 0, 1, 1).data
  return a ? [r / 255, g / 255, b / 255] : null
}

/** Lit une variable CSS (avec repli) telle que la voit `el` aujourd'hui. */
export function lireVariable(el: Element, nom: string, repli: string): Rvb {
  const brut = getComputedStyle(el).getPropertyValue(nom).trim()
  return lireCouleur(brut) ?? resoudre(brut) ?? lireCouleur(repli) ?? [0, 0.55, 0.97]
}

export function lirePalette(el: Element): PaletteVisage {
  const racine = document.documentElement
  const accent = lireVariable(el, '--accent-500', BLEU_ACCENT_REPLI)
  const ambre = lireVariable(el, '--warning-fg', AMBRE_REPLI)
  return paletteDepuisAccent(accent, ambre, estNuit(racine.getAttribute('data-theme')))
}

/* ───────────────────────── Caméra ───────────────────────── */

const FY = 1 / Math.tan((20 * Math.PI) / 180 / 2) // champ vertical 20° : peu de déformation

function camera(u: Uniformes, w: number, h: number, dpr: number, autour: boolean, yaw: number, pitch: number) {
  const largeurUtile = autour ? 0.40 * w : 0.86 * w
  const hautVisage = Math.min(0.80 * h, (largeurUtile * 2) / 1.75)
  const dist = (FY * h) / hautVisage
  const aspect = w / h
  const near = 0.1
  const far = 40
  const nf = 1 / (near - far)
  const P = u.uProj
  P.fill(0)
  P[0] = FY / aspect; P[5] = FY; P[10] = (far + near) * nf; P[11] = -1; P[14] = 2 * far * near * nf
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch)
  const R = u.uRot
  R[0] = cy; R[1] = 0; R[2] = -sy
  R[3] = sy * sx; R[4] = cx; R[5] = cy * sx
  R[6] = sy * cx; R[7] = -sx; R[8] = cy * cx
  u.uDist = dist
  u.uPx = 2.9 * dpr * Math.max(0.6, Math.min(1.3, hautVisage / 470))
}

function projeter(u: Uniformes, w: number, h: number, p: Float32Array, out: Float32Array) {
  const R = u.uRot
  const x = R[0] * p[0] + R[3] * p[1] + R[6] * p[2]
  const y = R[1] * p[0] + R[4] * p[1] + R[7] * p[2]
  const z = R[2] * p[0] + R[5] * p[1] + R[8] * p[2] - u.uDist
  const wq = -z
  out[0] = ((u.uProj[0] * x) / wq * 0.5 + 0.5) * w
  out[1] = (1 - ((u.uProj[5] * y) / wq * 0.5 + 0.5)) * h
}

/* ───────────────────────── Le visage ───────────────────────── */

export interface OptionsVisage {
  scene: HTMLElement
  canvasPoints: HTMLCanvasElement
  canvasFils: HTMLCanvasElement | null
  donnees: ArrayBuffer
  /** Nœuds des bulles (ordre des six ancres) : bout des fils sur grand écran. */
  puces: (HTMLElement | null)[]
  /** Bulles elles-mêmes : cible du regard quand le nœud est masqué (téléphone). */
  cibles: (HTMLElement | null)[]
  /** 'attention' = ambre, autre = bleu. */
  tons: string[]
  /** Accepte un WebGL rendu par le processeur (captures et mesures seulement). */
  accepterLogiciel?: boolean
  /** Cadence visée, plafonnée à 30. */
  ips?: number
  /** Appelé après la première image dessinée (le poster peut s'effacer). */
  surPremiereImage?: () => void
  /** Appelé si le contexte WebGL est perdu : l'appelant remet le poster. */
  surPerte?: () => void
}

export interface VisageMonte {
  choisir(i: number): void
  remesurer(): void
  stats(): { images: number; actif: boolean; dpr: number; n: number; largeur: number; hauteur: number }
  detruire(): void
}

export type ResultatMontage = { visage: VisageMonte; erreur?: undefined } | { visage: null; erreur: 'pas-de-webgl' | 'rendu-logiciel' | 'points-illisibles' }

export function monterVisage(o: OptionsVisage): ResultatMontage {
  const { scene, canvasPoints, canvasFils } = o
  let donnees: DonneesVisage
  try { donnees = decoderPoints(o.donnees) } catch { return { visage: null, erreur: 'points-illisibles' } }
  let rendu: Rendu | null = null
  try { rendu = creerRendu(canvasPoints, donnees) } catch { rendu = null }
  if (!rendu) return { visage: null, erreur: 'pas-de-webgl' }
  // WebGL « logiciel » : des cœurs entiers pour un visage → on garde l'image.
  if (!o.accepterLogiciel && estLogiciel(rendu.gl)) { rendu.detruire(); return { visage: null, erreur: 'rendu-logiciel' } }
  const moteur = rendu

  const u: Uniformes = {
    uProj: new Float32Array(16), uRot: new Float32Array(9), uDist: 7, uTime: 0, uBlink: 0,
    uScanY: 0, uScanAmt: 0, uPx: 2, uGaze: new Float32Array(2),
  }
  let pal = lirePalette(scene)
  const etat = {
    w: 1, h: 1, dpr: 1, autour: true, yaw: 0, pitch: 0, gx: 0, gy: 0, cibleX: 0, cibleY: 0,
    sourisX: 0, sourisY: 0, sx: 0, sy: 0, t: 0, dernier: 0, prochainClin: 2.4, debutClin: -10, double: false,
    raf: 0, actif: false, aLEcran: false, ongletVisible: document.visibilityState !== 'hidden', aMesurer: true,
    noeuds: [] as ([number, number] | null)[], cibles: [] as ([number, number] | null)[], choix: -1, images: 0,
    premiere: false, detruit: false,
  }
  const ctxFils = canvasFils ? canvasFils.getContext('2d') : null
  const tmpA = new Float32Array(2)
  const tmpP = new Float32Array(3)
  const regulateur = faireRegulateur(Math.min(o.ips ?? IMAGES_PAR_SECONDE_MAX, IMAGES_PAR_SECONDE_MAX))

  function taille() {
    const r = scene.getBoundingClientRect()
    etat.w = Math.max(1, r.width)
    etat.h = Math.max(1, r.height)
    etat.dpr = Math.min(window.devicePixelRatio || 1, 2)
    etat.autour = etat.w >= 760
    moteur.taille(Math.round(etat.w * etat.dpr), Math.round(etat.h * etat.dpr))
    moteur.palette(pal)
    if (canvasFils) {
      canvasFils.width = Math.round(etat.w * etat.dpr)
      canvasFils.height = Math.round(etat.h * etat.dpr)
    }
    etat.aMesurer = true
  }

  function mesurerNoeuds() {
    const r = scene.getBoundingClientRect()
    const centre = (el: HTMLElement | null | undefined): [number, number] | null => {
      if (!el || !el.isConnected) return null
      const b = el.getBoundingClientRect()
      if (!b.width) return null // nœud masqué (téléphone)
      return [b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top]
    }
    etat.noeuds = o.puces.map(centre)
    etat.cibles = o.puces.map((_el, i) => etat.noeuds[i] || centre(o.cibles[i]))
    etat.aMesurer = false
  }

  /** Direction du regard vers la bulle choisie, en [-1, 1], depuis le centre de la scène. */
  function viserChoix() {
    const n = etat.cibles[etat.choix]
    if (!n) { etat.cibleX = 0; etat.cibleY = 0; return }
    const dx = (n[0] - etat.w / 2) / (etat.w / 2)
    const dy = (n[1] - etat.h * 0.46) / (etat.h / 2)
    const l = Math.max(1, Math.hypot(dx, dy))
    etat.cibleX = dx / l
    etat.cibleY = dy / l
  }

  function animer(dt: number) {
    const t = etat.t
    const k = 1 - Math.exp(-dt * 3.2)
    const kYeux = 1 - Math.exp(-dt * 11)
    etat.sx += (etat.sourisX - etat.sx) * (1 - Math.exp(-dt * 3))
    etat.sy += (etat.sourisY - etat.sy) * (1 - Math.exp(-dt * 3))
    const yawCible = 0.16 * Math.sin(t * 0.23) + etat.sx * 0.16 + etat.cibleX * 0.16
    const pitchCible = 0.04 * Math.sin(t * 0.17 + 1.2) + etat.sy * 0.06 + etat.cibleY * 0.08
    etat.yaw += (yawCible - etat.yaw) * k
    etat.pitch += (pitchCible - etat.pitch) * k
    etat.gx += (etat.cibleX - etat.gx) * kYeux
    etat.gy += (-etat.cibleY - etat.gy) * kYeux
    // clignement : toutes les 3,4 à 6,6 s, parfois double
    if (t > etat.prochainClin) {
      etat.debutClin = t
      etat.double = Math.random() < 0.18
      etat.prochainClin = t + 3.4 + Math.random() * 3.2
    }
    const courbe = (x: number) => (x < 0 || x > 1 ? 0 : x < 0.38 ? x / 0.38 : x < 0.56 ? 1 : 1 - (x - 0.56) / 0.44)
    const v = (t - etat.debutClin) / 0.3
    u.uBlink = etat.double ? Math.max(courbe(v), courbe(v - 1.4)) : courbe(v)
    // balayage lumineux toutes les 9 s
    const sp = t % 9
    if (sp < 2.4) { u.uScanY = 1.25 - (sp / 2.4) * 2.6; u.uScanAmt = Math.sin((Math.PI * sp) / 2.4) * 0.85 } else u.uScanAmt = 0
  }

  function dessinerFils() {
    if (!ctxFils || !canvasFils) return
    ctxFils.setTransform(1, 0, 0, 1, 0, 0)
    ctxFils.clearRect(0, 0, canvasFils.width, canvasFils.height)
    if (!etat.autour) return
    ctxFils.setTransform(etat.dpr, 0, 0, etat.dpr, 0, 0)
    for (let i = 0; i < 6; i++) {
      const n = etat.noeuds[i]
      if (!n) continue
      tmpP[0] = donnees.ancres[i * 3]; tmpP[1] = donnees.ancres[i * 3 + 1]; tmpP[2] = donnees.ancres[i * 3 + 2]
      projeter(u, etat.w, etat.h, tmpP, tmpA)
      const sel = etat.choix === i
      const col = o.tons[i] === 'attention' ? pal.ambre : pal.fil
      const g = ctxFils.createLinearGradient(n[0], n[1], tmpA[0], tmpA[1])
      g.addColorStop(0, `rgba(${col},${sel ? 0.8 : 0.4})`)
      g.addColorStop(1, `rgba(${col},${sel ? 0.4 : 0.14})`)
      ctxFils.strokeStyle = g
      ctxFils.lineWidth = sel ? 1.5 : 1
      ctxFils.beginPath(); ctxFils.moveTo(n[0], n[1]); ctxFils.lineTo(tmpA[0], tmpA[1]); ctxFils.stroke()
      ctxFils.fillStyle = `rgba(${col},${sel ? 1 : 0.75})`
      ctxFils.beginPath(); ctxFils.arc(tmpA[0], tmpA[1], sel ? 3.2 : 2.2, 0, Math.PI * 2); ctxFils.fill()
      const f = (etat.t * (sel ? 0.42 : 0.16) + i * 0.173) % 1
      ctxFils.save()
      if (pal.halo) { ctxFils.shadowColor = `rgba(${col},0.9)`; ctxFils.shadowBlur = sel ? 12 : 6 }
      ctxFils.fillStyle = `rgba(${col},${sel ? 0.95 : 0.55})`
      ctxFils.beginPath(); ctxFils.arc(tmpA[0] + (n[0] - tmpA[0]) * f, tmpA[1] + (n[1] - tmpA[1]) * f, sel ? 2.4 : 1.6, 0, Math.PI * 2); ctxFils.fill()
      ctxFils.restore()
    }
  }

  function dessiner(now: number) {
    if (etat.aMesurer || etat.images % 40 === 0) { mesurerNoeuds(); viserChoix() }
    const dt = Math.min(0.1, Math.max(0, (now - etat.dernier) / 1000))
    etat.t += dt
    animer(dt)
    etat.dernier = now
    u.uTime = etat.t
    u.uGaze[0] = etat.gx; u.uGaze[1] = etat.gy
    camera(u, etat.w, etat.h, etat.dpr, etat.autour, etat.yaw, etat.pitch)
    moteur.dessiner(u)
    dessinerFils()
    etat.images++
    if (!etat.premiere) { etat.premiere = true; o.surPremiereImage?.() }
  }

  function boucle(now: number) {
    etat.raf = requestAnimationFrame(boucle)
    if (!regulateur(now)) return // plafond de cadence : on saute les rafraîchissements en trop
    dessiner(now)
  }

  function majBoucle() {
    if (etat.detruit) return
    const doit = boucleDoitTourner({ mouvementReduit: false, aLEcran: etat.aLEcran, ongletVisible: etat.ongletVisible })
    if (doit && !etat.actif) {
      etat.actif = true
      etat.dernier = performance.now() // pas de saut d'animation au retour
      etat.raf = requestAnimationFrame(boucle)
    } else if (!doit && etat.actif) {
      etat.actif = false
      cancelAnimationFrame(etat.raf)
    }
  }

  // pause hors écran (IntersectionObserver) et onglet caché (visibilitychange)
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => { etat.aLEcran = es[es.length - 1].isIntersecting; majBoucle() })
    : null
  if (io) io.observe(scene); else etat.aLEcran = true
  const surVisibilite = () => { etat.ongletVisible = document.visibilityState !== 'hidden'; majBoucle() }
  document.addEventListener('visibilitychange', surVisibilite)
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => taille()) : null
  if (ro) ro.observe(scene)
  // le thème change (data-theme sur <html>) : on relit le bleu dans les variables CSS
  const mo = new MutationObserver(() => { pal = lirePalette(scene); moteur.palette(pal) })
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

  const zoneSouris = scene.parentElement || scene
  const surSouris = (e: PointerEvent) => {
    const r = scene.getBoundingClientRect()
    etat.sourisX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)))
    etat.sourisY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)))
  }
  const surSortie = () => { etat.sourisX = 0; etat.sourisY = 0 }
  zoneSouris.addEventListener('pointermove', surSouris, { passive: true })
  zoneSouris.addEventListener('pointerleave', surSortie, { passive: true })
  const surPerte = (e: Event) => { e.preventDefault(); visage.detruire(); o.surPerte?.() }
  canvasPoints.addEventListener('webglcontextlost', surPerte)

  const visage: VisageMonte = {
    choisir(i) {
      etat.choix = i
      etat.aMesurer = true
      // petit accusé de réception : un clignement peu après le choix
      if (etat.t - etat.debutClin > 1) etat.prochainClin = Math.min(etat.prochainClin, etat.t + 0.35)
    },
    remesurer() { etat.aMesurer = true },
    stats() { return { images: etat.images, actif: etat.actif, dpr: etat.dpr, n: donnees.n, largeur: canvasPoints.width, hauteur: canvasPoints.height } },
    detruire() {
      if (etat.detruit) return
      etat.detruit = true
      cancelAnimationFrame(etat.raf)
      etat.actif = false
      io?.disconnect()
      ro?.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', surVisibilite)
      zoneSouris.removeEventListener('pointermove', surSouris)
      zoneSouris.removeEventListener('pointerleave', surSortie)
      canvasPoints.removeEventListener('webglcontextlost', surPerte)
      moteur.detruire()
    },
  }
  moteur.palette(pal)
  taille()
  majBoucle()
  return { visage }
}

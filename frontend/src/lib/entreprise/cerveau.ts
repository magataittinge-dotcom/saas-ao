// Mon entreprise — le cerveau lumineux : décisions et calculs purs (rien ici ne touche au DOM).
// L'image (WebP) est fournie ; un canvas par-dessus ajoute des effets (étincelles, éclairs, lueur,
// balayage, parallaxe). Tout ce qui se décide ou se calcule est ici, pour se tester sous Node.

/** Cadence visée : 60 images/s sur ordinateur, 30 au téléphone (écran tactile). */
export const IMAGES_ORDINATEUR = 60
export const IMAGES_TACTILE = 30

export const imagesParSeconde = (tactile: boolean): number => (tactile ? IMAGES_TACTILE : IMAGES_ORDINATEUR)

/** Marge (ms) qui absorbe le tremblement des horloges d'écran sans dépasser la cadence sur la durée. */
const TOLERANCE_MS = 2

/**
 * Régulateur de cadence : appelé à chaque rafraîchissement d'écran (requestAnimationFrame), il répond « oui »
 * seulement quand une image doit être calculée. Le rythme moyen ne dépasse jamais `ips`, quelle que soit la
 * fréquence de l'écran (144 Hz compris).
 */
export function faireRegulateur(ips: number): (maintenant: number) => boolean {
  const intervalle = 1000 / Math.max(1, ips)
  let prochaine = -Infinity
  return (maintenant: number) => {
    if (maintenant < prochaine - TOLERANCE_MS) return false
    // En retard de plus d'un intervalle (premier appel, retour d'une pause) : on repart de maintenant.
    prochaine = maintenant - prochaine > intervalle ? maintenant + intervalle : prochaine + intervalle
    return true
  }
}

export interface EtatCarte {
  /** prefers-reduced-motion: reduce */
  mouvementReduit: boolean
  /** La carte est dans la zone visible de la fenêtre. */
  aLEcran: boolean
  /** L'onglet du navigateur est visible. */
  ongletVisible: boolean
}

/** Faut-il même télécharger le module des effets ? Non en mouvement réduit (l'image seule suffit : 0 octet de script). */
export function doitMonterEffets(e: Pick<EtatCarte, 'mouvementReduit' | 'aLEcran'> & { serveur?: boolean }): boolean {
  return !e.serveur && !e.mouvementReduit && e.aLEcran
}

/** La boucle d'images ne tourne que si la carte est à l'écran, l'onglet visible et le mouvement permis : 0 image hors écran. */
export function boucleDoitTourner(e: EtatCarte): boolean {
  return !e.mouvementReduit && e.aLEcran && e.ongletVisible
}

// ─── Géométrie : l'image est posée en « cover », les effets doivent suivre ───

/** Dimensions de l'image d'origine (rapport commun aux deux WebP). */
export const IMAGE = { largeur: 2752, hauteur: 1536 } as const
/** Position de l'image dans la carte (object-position) : le cerveau reste cadré quand la carte est plus large que haute. */
export const POSITION_IMAGE = { x: 0.5, y: 0.4 } as const

/** Points de repère de l'image, en fraction de sa largeur (u) et de sa hauteur (v). */
export const REPERES = {
  centre: { u: 0.503, v: 0.42 },
  bordGauche: { u: 0.236, v: 0.48 },
  bordDroit: { u: 0.77, v: 0.47 },
} as const

export interface Cadrage { echelle: number; decalX: number; decalY: number }

/** Placement d'une image en object-fit: cover dans une boîte (cw × ch), avec object-position (px, py ∈ [0,1]). */
export function cadrageCover(cw: number, ch: number, iw = IMAGE.largeur, ih = IMAGE.hauteur, px = POSITION_IMAGE.x, py = POSITION_IMAGE.y): Cadrage {
  const echelle = Math.max(cw / iw, ch / ih)
  return { echelle, decalX: (cw - iw * echelle) * px, decalY: (ch - ih * echelle) * py }
}

/** Position, dans la boîte, d'un repère (u, v) de l'image. */
export function pointDansBoite(c: Cadrage, u: number, v: number, iw = IMAGE.largeur, ih = IMAGE.hauteur): { x: number; y: number } {
  return { x: c.decalX + u * iw * c.echelle, y: c.decalY + v * ih * c.echelle }
}

// ─── Aléa reproductible ───

/** Générateur pseudo-aléatoire à graine (mulberry32) : mêmes étincelles et mêmes éclairs à chaque essai. */
export function faireAlea(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Éclairs ───

export type Point = [number, number]
export interface Eclair { principal: Point[]; branches: Point[][] }

/** Subdivise une ligne en déplaçant chaque milieu perpendiculairement (déplacement du point milieu). */
function fracturer(depart: Point[], niveaux: number, rugosite: number, alea: () => number): Point[] {
  let pts = depart
  for (let n = 0; n < niveaux; n++) {
    const suite: Point[] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const long = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const nx = -(b[1] - a[1]) / long, ny = (b[0] - a[0]) / long
      const k = (alea() - 0.5) * long * rugosite
      suite.push([(a[0] + b[0]) / 2 + nx * k, (a[1] + b[1]) / 2 + ny * k], b)
    }
    pts = suite
  }
  return pts
}

/** Un éclair entre deux points : un trait principal (64 segments) et trois branches plus courtes. */
export function faireEclair(x0: number, y0: number, x1: number, y1: number, rugosite: number, alea: () => number): Eclair {
  const principal = fracturer([[x0, y0], [x1, y1]], 6, rugosite, alea)
  const branches: Point[][] = []
  for (let i = 0; i < 3; i++) {
    const depart = principal[4 + Math.floor(alea() * (principal.length - 8))]
    const dx = x1 - x0
    const angle = Math.atan2(y1 - y0, dx) + (alea() - 0.5) * 1.2
    const longueur = Math.abs(dx) * (0.15 + alea() * 0.25)
    branches.push(fracturer([depart, [depart[0] + Math.cos(angle) * longueur, depart[1] + Math.sin(angle) * longueur]], 4, rugosite, alea))
  }
  return { principal, branches }
}

/** Intervalle (ms) entre deux nouveaux tracés d'éclair : ils « tremblent » à ce rythme. */
export const TREMBLEMENT_MS = 110

// ─── Étincelles ───

export interface Etincelle { u: number; v: number; rayon: number; phase: number; frequence: number }

function gauss(alea: () => number): number { return (alea() + alea() + alea() + alea() - 2) / 1.2 }

/** Étincelles réparties autour du cerveau (fractions de l'image) : rayon 0,5 à 1,9 px, scintillement propre à chacune. */
export function faireEtincelles(n: number, alea: () => number): Etincelle[] {
  return Array.from({ length: n }, () => ({
    u: REPERES.centre.u + gauss(alea) * 0.2,
    v: REPERES.centre.v + gauss(alea) * 0.24,
    rayon: 0.5 + alea() * 1.4,
    phase: alea() * Math.PI * 2,
    frequence: 0.6 + alea() * 1.6,
  }))
}

/** Opacité d'une étincelle à l'instant t (ms) : entre 0,25 et 0,85. */
export const eclatEtincelle = (e: Etincelle, t: number): number => 0.25 + 0.6 * (0.5 + 0.5 * Math.sin((t / 1000) * e.frequence + e.phase))

// ─── Lueur, balayage, parallaxe ───

/** Lueur qui respire : 0 à 1, période 5,2 s. */
export const respiration = (t: number): number => 0.5 + 0.5 * Math.sin(t / 2600)

/** Position du balayage lumineux, de 0 (bord gauche du cerveau) à 1 (bord droit), un passage toutes les 6,5 s. */
export const positionBalayage = (t: number): number => (t / 6500) % 1

/** Rattrapage progressif de la souris, indépendant de la cadence (constante de temps 120 ms). */
export function suivre(actuel: number, cible: number, dtMs: number): number {
  return actuel + (cible - actuel) * (1 - Math.exp(-Math.max(0, dtMs) / 120))
}

/** Parallaxe maximale de l'image (px CSS) et agrandissement qui garde les bords couverts. */
export const PARALLAXE = { x: 10, y: 7, zoom: 1.04 } as const

/** Position normalisée de la souris dans une boîte, bornée à [-1, 1]. */
export function positionSouris(clientX: number, clientY: number, gauche: number, haut: number, largeur: number, hauteur: number): { x: number; y: number } {
  const borne = (v: number) => Math.max(-1, Math.min(1, v))
  return { x: borne(((clientX - gauche) / (largeur || 1) - 0.5) * 2), y: borne(((clientY - haut) / (hauteur || 1) - 0.5) * 2) }
}

// ─── Couleurs : on part du bleu d'accent lu dans les variables CSS ───

export type Rvb = [number, number, number]

/** Lit « #rgb », « #rrggbb » ou « rgb(r g b) / rgb(r, g, b) » ; null si illisible. */
export function lireRvb(texte: string | null | undefined): Rvb | null {
  if (!texte) return null
  const t = texte.trim().toLowerCase()
  let m = t.match(/^#([0-9a-f]{3})$/)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as Rvb
  m = t.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as Rvb
  m = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

/** Chaîne rgba() depuis un triplet 0..255 et une opacité. */
export const rgba = (c: Rvb, a: number): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

/** Éclaircit un bleu vers le blanc (t ∈ [0,1]). */
export const eclaircir = (c: Rvb, t: number): Rvb => [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]

export const BLEU_REPLI: Rvb = [0, 140, 248]

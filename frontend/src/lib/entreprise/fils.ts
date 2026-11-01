// Mon entreprise — les fils qui relient les bulles au visage : une courbe de Bézier par bulle, trois particules qui y
// circulent. Géométrie et cadence pures ; le dessin (canvas 2D) est dans `FilsVisage.tsx`.

/** Cadence visée : 60 images/s sur ordinateur, 30 au téléphone (écran tactile). */
export const IMAGES_ORDINATEUR = 60
export const IMAGES_TACTILE = 30
export const PARTICULES_PAR_FIL = 3

export const imagesParSeconde = (tactile: boolean): number => (tactile ? IMAGES_TACTILE : IMAGES_ORDINATEUR)

/** La boucle d'images ne tourne que si la scène est à l'écran, l'onglet visible et le mouvement permis : 0 image hors écran. */
export function boucleDoitTourner(e: { mouvementReduit: boolean; aLEcran: boolean; ongletVisible: boolean }): boolean {
  return !e.mouvementReduit && e.aLEcran && e.ongletVisible
}

/** Tolérance sur l'horloge de l'écran : un écran à 61 Hz ne perd pas une image sur deux face à 60. */
const TOLERANCE_MS = 2

/**
 * Régulateur de cadence : appelé à chaque image de l'écran (requestAnimationFrame) avec l'horloge en millisecondes,
 * il répond « calcule cette image » ou « passe ». Le rythme moyen ne dépasse jamais `ips`, quelle que soit la
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

export interface Point { x: number; y: number }
export interface Courbe { p0: Point; c1: Point; c2: Point; p3: Point }

/**
 * Courbe du fil : de l'ancre sur le visage `p0` au bord de la bulle `p3`. Les poignées sont horizontales,
 * à 45 % et 35 % de l'écart : le fil sort du visage à plat et arrive à plat sur la bulle.
 */
export function courbe(p0: Point, p3: Point): Courbe {
  const dx = p3.x - p0.x
  return { p0, c1: { x: p0.x + dx * 0.45, y: p0.y }, c2: { x: p3.x - dx * 0.35, y: p3.y }, p3 }
}

/**
 * Le fil quand le visage bouge (parallaxe) : le départ côté visage (`p0` et sa poignée `c1`) suit le décalage,
 * l'arrivée sur la bulle (`c2`, `p3`) ne bouge pas — le fil reste accroché à la bulle. Sans décalage : la même courbe.
 */
export function decalerDepart(c: Courbe, dx: number, dy: number): Courbe {
  if (dx === 0 && dy === 0) return c
  return { p0: { x: c.p0.x + dx, y: c.p0.y + dy }, c1: { x: c.c1.x + dx, y: c.c1.y + dy }, c2: c.c2, p3: c.p3 }
}

/** Point de la courbe à l'instant t ∈ [0, 1]. */
export function pointSurCourbe(c: Courbe, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.p3.y,
  }
}

export interface Particule { decalage: number; vitesse: number }

/** Trois particules par fil, régulièrement espacées ; la vitesse (tours par seconde) varie de 0,05 à 0,08 selon le fil. */
export function creerParticules(indiceFil: number): Particule[] {
  const vitesse = 0.05 + (((indiceFil * 7 + 3) % 10) / 10) * 0.03
  return [0, 1 / 3, 2 / 3].map((decalage) => ({ decalage, vitesse }))
}

/** Position d'une particule le long du fil à l'horloge `ms` ; `fixe` pour la scène immobile (mouvement réduit). */
export function positionParticule(p: Particule, ms: number, fixe = false): number {
  return fixe ? p.decalage : ((ms / 1000) * p.vitesse + p.decalage) % 1
}

/** Intensité d'une particule : discrète aux extrémités du fil, pleine au milieu. */
export const opaciteParticule = (t: number): number => 0.25 + 0.75 * Math.sin(t * Math.PI)

/** « #0078d6 » ou « #07d » → [0, 120, 214] ; autre chose → null. */
export function hexVersRvb(valeur: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(valeur.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Une couleur et son opacité en « #rrggbbaa » (accepté par le canvas, sans écrire de couleur en dur). */
export function hexAlpha(rvb: [number, number, number], alpha: number): string {
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${x(rvb[0])}${x(rvb[1])}${x(rvb[2])}${x(alpha * 255)}`
}

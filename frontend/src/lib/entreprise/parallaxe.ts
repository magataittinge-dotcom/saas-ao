/**
 * Parallaxe du visage de « Mon entreprise » : à la souris, le visage et le départ de ses fils se décalent (±6 px) et
 * s'inclinent (≤ 2°) selon la position du pointeur dans la scène, puis reviennent en douceur quand il en sort.
 * Même geste que l'inclinaison de la carte de l'accueil (CarteFrance), en plus discret. Jamais en « réduire les
 * animations », jamais au toucher (seul un pointeur `mouse` déclenche), jamais au téléphone.
 * Fonctions pures, testées sans navigateur ; SceneVisage les branche sur un requestAnimationFrame qui s'arrête
 * dès que le visage est revenu au repos.
 */

export const DECALAGE_MAX_PX = 6
export const INCLINAISON_MAX_DEG = 2
/** Constante de temps du lissage : ~95 % du chemin en 3 τ ≈ 0,5 s. */
export const LISSAGE_MS = 160
/** En dessous de cet écart (en fraction de l'amplitude), le visage est considéré au repos : la boucle s'arrête. */
export const REPOS_EPSILON = 0.002

/** Position normalisée du pointeur : -1 (bord gauche / haut) à 1 (bord droit / bas), 0 au centre. */
export interface Normale { x: number; y: number }
export const REPOS: Normale = { x: 0, y: 0 }

export interface Pose { dx: number; dy: number; rotX: number; rotY: number }

const borner = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0)

/** Le pointeur (coordonnées écran) dans le rectangle de la scène → position normalisée bornée à [-1, 1]. */
export function normaliser(clientX: number, clientY: number, r: { left: number; top: number; width: number; height: number }): Normale {
  if (!(r.width > 0) || !(r.height > 0)) return REPOS
  return {
    x: borner(((clientX - r.left) / r.width) * 2 - 1),
    y: borner(((clientY - r.top) / r.height) * 2 - 1),
  }
}

/** La pose du visage pour une position normalisée : décalage dans le sens du pointeur, inclinaison vers lui. */
export function pose(n: Normale): Pose {
  const x = borner(n.x)
  const y = borner(n.y)
  return {
    dx: x * DECALAGE_MAX_PX,
    dy: y * DECALAGE_MAX_PX,
    rotX: -y * INCLINAISON_MAX_DEG,
    rotY: x * INCLINAISON_MAX_DEG,
  }
}

/** La transformation CSS d'une pose (le parent porte la perspective). Au repos : chaîne vide (aucun calque gardé). */
export function transformation(p: Pose): string {
  if (Math.abs(p.dx) < 0.01 && Math.abs(p.dy) < 0.01 && Math.abs(p.rotX) < 0.01 && Math.abs(p.rotY) < 0.01) return ''
  return `translate3d(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px, 0) rotateX(${p.rotX.toFixed(2)}deg) rotateY(${p.rotY.toFixed(2)}deg)`
}

/** Un pas de lissage exponentiel de `courant` vers `cible` après `dtMs` (indépendant de la cadence d'images). */
export function lisser(courant: Normale, cible: Normale, dtMs: number): Normale {
  const k = 1 - Math.exp(-Math.max(0, Math.min(dtMs, 100)) / LISSAGE_MS)
  return { x: courant.x + (cible.x - courant.x) * k, y: courant.y + (cible.y - courant.y) * k }
}

/** Vrai quand le visage a rejoint sa cible : la boucle peut s'arrêter. */
export function auRepos(courant: Normale, cible: Normale): boolean {
  return Math.abs(courant.x - cible.x) < REPOS_EPSILON && Math.abs(courant.y - cible.y) < REPOS_EPSILON
}

/** La parallaxe n'est permise qu'à la souris, sur grand écran, mouvement permis et scène visible. */
export function parallaxePermise(o: { pointerType: string; mouvementReduit: boolean; tactile: boolean; large: boolean; actif: boolean }): boolean {
  return o.pointerType === 'mouse' && !o.mouvementReduit && !o.tactile && o.large && o.actif
}

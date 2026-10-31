// Calculs de la carte de France (sans React) : paliers des bulles, libellés, sélection multiple,
// zoom et déplacement du cadre (viewBox), navigation au clavier d'un département à l'autre.

export interface Cadre { x: number; y: number; w: number; h: number }

/** Les départements qu'une zone peut contenir au plus (limite du serveur : 30). */
export const MAX_DEPARTEMENTS = 30

/** Trois paliers de taille : 1 à 4 avis, 5 à 19, 20 et plus (rayon en pixels d'écran). */
export function rayonBulle(n: number): number {
  if (n >= 20) return 18
  if (n >= 5) return 14.5
  return 11
}

/** Palier 1, 2 ou 3 (pour les tests et les attributs de style). */
export function palierBulle(n: number): 1 | 2 | 3 {
  return n >= 20 ? 3 : n >= 5 ? 2 : 1
}

/** Chiffre écrit dans la bulle : « 99+ » au-delà de 99 pour garder la bulle lisible. */
export const chiffreBulle = (n: number) => (n > 99 ? '99+' : String(n))

/** « Rhône, 12 avis » (nom lu par les lecteurs d'écran, repris dans l'infobulle). */
export function libelleDepartement(nom: string, n: number): string {
  if (n <= 0) return `${nom}, aucun avis ouvert`
  return `${nom}, ${n} avis`
}

/** Ajoute le code à la sélection, ou le retire s'il y est déjà ; la limite du serveur n'est jamais dépassée. */
export function basculerSelection(selection: readonly string[], code: string, max = MAX_DEPARTEMENTS): string[] {
  if (selection.includes(code)) return selection.filter((c) => c !== code)
  if (selection.length >= max) return [...selection]
  return [...selection, code]
}

const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Le cadre reste dans le dessin entier. */
export function cadrer(c: Cadre, plein: Cadre): Cadre {
  return {
    ...c,
    x: borner(c.x, plein.x, plein.x + plein.w - c.w),
    y: borner(c.y, plein.y, plein.y + plein.h - c.h),
  }
}

export const ZOOM_MAX = 8

/** Zoom autour du point (fx, fy) ∈ [0, 1]² du cadre affiché ; facteur > 1 rapproche. Garde les proportions du dessin entier. */
export function zoomer(c: Cadre, facteur: number, fx: number, fy: number, plein: Cadre): Cadre {
  const largeur = borner(c.w / facteur, plein.w / ZOOM_MAX, plein.w)
  const hauteur = largeur * (plein.h / plein.w)
  const x = c.x + (c.w - largeur) * fx
  const y = c.y + (c.h - hauteur) * fy
  return cadrer({ x, y, w: largeur, h: hauteur }, plein)
}

/** Déplace le cadre de (dx, dy) unités du dessin. */
export function deplacer(c: Cadre, dx: number, dy: number, plein: Cadre): Cadre {
  return cadrer({ ...c, x: c.x + dx, y: c.y + dy }, plein)
}

export const estZoome = (c: Cadre, plein: Cadre) => c.w < plein.w - 0.5

export type Direction = 'gauche' | 'droite' | 'haut' | 'bas'

/** Le département le plus proche dans la direction demandée (flèches du clavier), ou null. */
export function voisinDansLaDirection(
  points: readonly { code: string; cx: number; cy: number }[],
  depuis: string,
  direction: Direction,
): string | null {
  const o = points.find((p) => p.code === depuis)
  if (!o) return null
  const [ux, uy] = direction === 'gauche' ? [-1, 0] : direction === 'droite' ? [1, 0] : direction === 'haut' ? [0, -1] : [0, 1]
  let meilleur: { code: string; score: number } | null = null
  for (const p of points) {
    if (p.code === depuis) continue
    const dx = p.cx - o.cx
    const dy = p.cy - o.cy
    const devant = dx * ux + dy * uy
    if (devant <= 0) continue
    const cote = Math.abs(dx * uy - dy * ux)
    if (cote > devant * 1.6) continue          // hors du cône de 116°
    const score = devant + cote * 1.5
    if (!meilleur || score < meilleur.score) meilleur = { code: p.code, score }
  }
  return meilleur?.code ?? null
}

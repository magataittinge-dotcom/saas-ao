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

/** Bulles plus petites sur téléphone (la zone tactile reste de 44 px). */
export const FACTEUR_COMPACT = 0.78

/** Rayon réellement dessiné, en pixels d'écran. */
export const rayonAffiche = (n: number, compact = false): number => rayonBulle(n) * (compact ? FACTEUR_COMPACT : 1)

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

/** 20× : à 8×, Paris (20 avis et plus) et les Hauts-de-Seine (7 km d'écart) restaient collés ; sur un téléphone (carte de 340 px), il faut 17× pour les séparer. */
export const ZOOM_MAX = 20

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

/* ── Bulles qui se chevauchent : regroupement selon l'échelle ───────────────────────────── */

export interface BulleDep { code: string; cx: number; cy: number; compte: number }

/** Une bulle seule (un code) ou un groupe (plusieurs codes triés) : centre au barycentre pondéré par les comptes. */
export interface GroupeBulles {
  codes: string[]
  cx: number
  cy: number
  compte: number
  /** Rayon dessiné, en pixels d'écran. */
  rayon: number
}

/** Pixels d'écran laissés libres entre deux bulles avant de les fusionner. */
export const MARGE_BULLES = 4

export const estGroupe = (g: GroupeBulles) => g.codes.length > 1

/**
 * Fusionne les bulles dont les disques se chevauchent à l'écran : distance des centres (en pixels, soit la distance
 * du dessin × échelle) < somme des rayons + marge. Transitif : si A touche B et B touche C, un seul groupe. Puis glouton :
 * le groupe (barycentre, rayon du total) peut toucher un autre groupe, et on fusionne la première paire qui se touche
 * (ordre des codes) jusqu'à ce que plus rien ne se touche.
 * Le résultat ne dépend pas de l'ordre d'entrée. Les départements sans avis n'ont pas de bulle. Plus l'échelle
 * grandit (zoom), plus les distances à l'écran grandissent, et les groupes se défont.
 */
export function regrouperBulles(
  bulles: readonly BulleDep[],
  echelle: number,
  options: { compact?: boolean; marge?: number } = {},
): GroupeBulles[] {
  const compact = options.compact ?? false
  const marge = options.marge ?? MARGE_BULLES
  interface Acc { codes: string[]; sx: number; sy: number; compte: number }
  const vers = (a: Acc): GroupeBulles => ({
    codes: a.codes, cx: a.sx / a.compte, cy: a.sy / a.compte, compte: a.compte, rayon: rayonAffiche(a.compte, compact),
  })
  const parCode = (x: Acc, y: Acc) => (x.codes[0] < y.codes[0] ? -1 : x.codes[0] > y.codes[0] ? 1 : 0)
  const seules: Acc[] = bulles
    .filter((b) => b.compte > 0)
    .map((b) => ({ codes: [b.code], sx: b.cx * b.compte, sy: b.cy * b.compte, compte: b.compte }))
    .sort(parCode)
  if (!(echelle > 0)) return seules.map(vers)
  const touche = (a: Acc, b: Acc) => {
    const ga = vers(a)
    const gb = vers(b)
    return Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) * echelle < ga.rayon + gb.rayon + marge
  }
  // 1. transitivité : si A touche B et B touche C, les trois sont dans le même groupe (composantes connexes)
  const parent = seules.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])))
  for (let i = 0; i < seules.length; i++) {
    for (let j = i + 1; j < seules.length; j++) {
      if (touche(seules[i], seules[j])) parent[racine(j)] = racine(i)
    }
  }
  const parRacine = new Map<number, Acc>()
  seules.forEach((a, i) => {
    const r = racine(i)
    const g = parRacine.get(r)
    if (!g) parRacine.set(r, { ...a, codes: [...a.codes] })
    else { g.codes.push(...a.codes); g.sx += a.sx; g.sy += a.sy; g.compte += a.compte }
  })
  let groupes = [...parRacine.values()].map((g) => ({ ...g, codes: g.codes.sort() })).sort(parCode)
  // 2. un groupe, plus gros, peut toucher un autre groupe : on fusionne la première paire qui se touche, jusqu'à la fin
  for (;;) {
    let fusion: [number, number] | null = null
    for (let i = 0; i < groupes.length && !fusion; i++) {
      for (let j = i + 1; j < groupes.length; j++) {
        if (touche(groupes[i], groupes[j])) { fusion = [i, j]; break }
      }
    }
    if (!fusion) break
    const [i, j] = fusion
    const a = groupes[i]
    const b = groupes[j]
    const fusionne: Acc = { codes: [...a.codes, ...b.codes].sort(), sx: a.sx + b.sx, sy: a.sy + b.sy, compte: a.compte + b.compte }
    groupes = [...groupes.filter((_, k) => k !== i && k !== j), fusionne].sort(parCode)
  }
  return groupes.map(vers)
}

/** « 115 avis ouverts dans 4 départements : Paris, Hauts-de-Seine, … » (nom lu par les lecteurs d'écran, repris dans l'infobulle). */
export function libelleGroupe(noms: readonly string[], total: number): string {
  return `${total} avis ouverts dans ${noms.length} départements : ${noms.join(', ')}`
}

/** Clé stable d'un groupe (pour l'infobulle et les tests). */
export const cleGroupe = (codes: readonly string[]) => codes.join('+')

/**
 * Cadre qui montre un groupe : centré sur la boîte englobante de ses départements, avec une marge, et assez rapproché
 * pour que ses bulles se séparent (zoom augmenté par paliers de 20 % jusqu'à ce que plus aucune bulle du groupe n'en
 * touche une autre), sans dépasser ZOOM_MAX ni perdre un département du groupe de vue. `largeurPx` : largeur affichée de la carte.
 */
export function cadreSurGroupe(
  points: readonly BulleDep[],
  codes: readonly string[],
  largeurPx: number,
  plein: Cadre,
  options: { compact?: boolean; marge?: number } = {},
): Cadre {
  const membres = points.filter((p) => codes.includes(p.code) && p.compte > 0)
  if (membres.length === 0 || !(largeurPx > 0)) return plein
  const xs = membres.map((m) => m.cx)
  const ys = membres.map((m) => m.cy)
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2
  const boiteW = Math.max(...xs) - Math.min(...xs)
  const boiteH = Math.max(...ys) - Math.min(...ys)
  const ratio = plein.h / plein.w
  // la boîte, avec une marge de 25 % de chaque côté, doit tenir dans le cadre
  const largeurMini = Math.max(boiteW, boiteH / ratio) * 1.5
  const cadreA = (z: number): Cadre => {
    const w = plein.w / z
    return cadrer({ x: centreX - w / 2, y: centreY - (w * ratio) / 2, w, h: w * ratio }, plein)
  }
  // zoom qui montre toute la boîte avec sa marge (au moins 2×), et zoom qui sépare les bulles : on prend le premier
  // zoom qui sépare, sans jamais perdre de vue un département du groupe.
  const zMax = Math.min(ZOOM_MAX, Math.max(2, plein.w / largeurMini))
  for (let z = 2; z < zMax; z *= 1.2) {
    const cible = cadreA(z)
    if (regrouperBulles(membres, largeurPx / cible.w, options).length === membres.length) return cible
  }
  return cadreA(zMax)
}

// Lecture des jetons de src/styles/theme.css pour les tests : clair et nuit, alias suivis,
// couleurs composées sur un fond (les bordures sont des noirs / blancs translucides).
import { lire } from './sources'

export type Theme = 'light' | 'dark'
type Carte = Record<string, string>

/** Règles de premier niveau « sélecteurs { déclarations } » (les @media sont ignorés). */
function regles(css: string): { selecteurs: string[]; decl: Carte }[] {
  const sans = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const sortie: { selecteurs: string[]; decl: Carte }[] = []
  let i = 0
  while (i < sans.length) {
    const ouvre = sans.indexOf('{', i)
    if (ouvre < 0) break
    const entete = sans.slice(i, ouvre).trim()
    let profondeur = 1
    let j = ouvre + 1
    while (j < sans.length && profondeur > 0) {
      if (sans[j] === '{') profondeur++
      else if (sans[j] === '}') profondeur--
      j++
    }
    const corps = sans.slice(ouvre + 1, j - 1)
    if (!entete.startsWith('@')) {
      const decl: Carte = {}
      for (const m of corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim().replace(/\s+/g, ' ')
      sortie.push({ selecteurs: entete.split(',').map((s) => s.trim()), decl })
    }
    i = j
  }
  return sortie
}

const REGLES = regles(lire('src/styles/theme.css'))

/** Toutes les déclarations d'un thème : le clair d'abord, la nuit par-dessus. */
export function jetons(theme: Theme): Carte {
  const clair = [':root', '[data-theme="light"]', '[data-theme]']
  const nuit = ['[data-theme="dark"]']
  const carte: Carte = {}
  for (const r of REGLES) if (r.selecteurs.some((s) => clair.includes(s))) Object.assign(carte, r.decl)
  if (theme === 'dark') for (const r of REGLES) if (r.selecteurs.some((s) => nuit.includes(s))) Object.assign(carte, r.decl)
  return carte
}

/** Valeur finale d'un jeton (--x), les var(--y) étant remplacés. Lève une erreur si un renvoi est cassé. */
export function valeur(theme: Theme, nom: string, carte: Carte = jetons(theme), vus: string[] = []): string {
  if (vus.includes(nom)) throw new Error(`boucle d'alias : ${[...vus, nom].join(' → ')}`)
  const brut = carte[nom]
  if (brut === undefined) throw new Error(`jeton ${nom} absent (${theme})`)
  return brut.replace(/var\((--[\w-]+)\)/g, (_m, autre) => valeur(theme, autre, carte, [...vus, nom]))
}

type Rgba = [number, number, number, number]
export function analyser(c: string): Rgba {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba
  const rgb = c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  throw new Error(`couleur illisible : ${c}`)
}

/** Les couleurs d'une valeur (une couleur seule, ou les paliers d'un dégradé). */
export function couleurs(v: string): string[] {
  return [...v.matchAll(/#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi)].map((m) => m[0])
}

function compose(avant: Rgba, fond: [number, number, number]): [number, number, number] {
  const a = avant[3]
  return [0, 1, 2].map((i) => Math.round(avant[i] * a + fond[i] * (1 - a))) as [number, number, number]
}
function luminance([r, g, b]: [number, number, number]): number {
  const c = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

/** Contraste WCAG 2 de `avant` (éventuellement translucide) posé sur `fond` (opaque). */
export function contraste(avant: string, fond: string): number {
  const f = analyser(fond)
  const fondRgb: [number, number, number] = [f[0], f[1], f[2]]
  const a = luminance(compose(analyser(avant), fondRgb))
  const b = luminance(fondRgb)
  const [h, l] = a > b ? [a, b] : [b, a]
  return (h + 0.05) / (l + 0.05)
}

/** Couleur translucide posée sur une couleur opaque → hexadécimal. */
export function composer(couleur: string, sur: string): string {
  const s = analyser(sur)
  const [r, g, b] = compose(analyser(couleur), [s[0], s[1], s[2]])
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Contraste d'un jeton (ou de chaque palier d'un dégradé) sur un jeton de surface, dans un thème.
 *  `sur` : surface sous un fond translucide (verre, bordure). */
export function contrasteJetons(theme: Theme, texte: string, fond: string, sur?: string): { minimum: number; detail: string } {
  const fonds = couleurs(valeur(theme, fond)).map((f) => (analyser(f)[3] < 1 && sur ? composer(f, valeur(theme, sur)) : f))
  const textes = couleurs(valeur(theme, texte))
  const mesures = fonds.flatMap((f) => textes.map((t) => contraste(t, f)))
  return { minimum: Math.min(...mesures), detail: mesures.map((m) => m.toFixed(2)).join(' / ') }
}

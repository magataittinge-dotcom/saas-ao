// Lecture de la palette pour les tests de couleur : valeurs sRGB de theme.css (tests/outils/jetons.ts), valeurs du bloc
// « Gamut large » (display-p3), mesure du visage et palette générée (scripts/*.json).
import { lire } from './sources'
import { valeur, type Theme } from './jetons'
import { aplatir, contraste } from '../../scripts/couleur.mjs'

export const THEMES: Theme[] = ['light', 'dark']
export const ETATS = ['bleu', 'vert', 'ambre', 'rouge', 'turquoise', 'gris'] as const
export const SURFACES = ['--surface-page', '--surface-0', '--surface-1', '--surface-2']

export type Fiche = { css: string; hex?: string; oklch?: [number, number, number]; p3?: string; source: string }
export type Palette = {
  teintes: { ombres: number; lumieres: number; famille: number; flamme: number; or: number }
  teintesEtats: Record<string, number>
  tolerance: number
  commun: Record<string, Fiche>; clair: Record<string, Fiche>; nuit: Record<string, Fiche>
}
export const palette = JSON.parse(lire('scripts/palette-visage.json')) as Palette
export const mesure = JSON.parse(lire('scripts/visage-mesure.json')) as {
  ensemble: { images: number; partColoree: number; chromaMax: number; fond: { L: number; C: number; h: number; hex: string }; ombres: { L: number; C: number; h: number }; lumieres: { h: number }; familles: { h: number; part: number }[] }
  clips: { nom: string; images: number; ombres: { h: number } }[]
}

const THEME_CSS = lire('src/styles/theme.css')
const DEBUT = '/* ── Gamut large'
const FIN = '/* ── fin du gamut large ── */'
export const blocP3 = THEME_CSS.slice(THEME_CSS.indexOf(DEBUT), THEME_CSS.indexOf(FIN))

/** Jetons redéfinis en display-p3, par thème. */
export function jetonsP3(theme: Theme): Record<string, string> {
  const coupe = blocP3.indexOf('[data-theme="dark"] {')
  const texte = theme === 'light' ? blocP3.slice(0, coupe) : blocP3.slice(coupe)
  const carte: Record<string, string> = {}
  for (const m of texte.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) carte[m[1]] = m[2].trim()
  return carte
}

/** Les couleurs d'une valeur : une couleur seule, ou les paliers d'un dégradé (hex, rgba, display-p3). */
export const couleursDe = (v: string): string[] => [...v.matchAll(/#[0-9a-f]{6}\b|rgba?\([^)]*\)|color\(display-p3[^)]*\)/gi)].map((m) => m[0])

/** Valeur d'un jeton dans un thème et un gamut (« p3 » : la valeur du bloc Gamut large si elle existe, sinon le repli). */
export function val(theme: Theme, nom: string, gamut: 'srgb' | 'p3' = 'srgb'): string {
  return (gamut === 'p3' ? jetonsP3(theme)[nom] : undefined) ?? valeur(theme, nom)
}

/** Contraste minimal d'un jeton sur un autre (dégradés : chaque palier ; fond translucide : posé sur `sur`). */
export function contrasteMin(theme: Theme, avant: string, fond: string, sur?: string, gamut: 'srgb' | 'p3' = 'srgb'): number {
  const dessous = sur ? couleursDe(val(theme, sur, gamut))[0] : undefined
  const fonds = couleursDe(val(theme, fond, gamut)).map((f) => (dessous ? aplatir(f, dessous) : f))
  const avants = couleursDe(val(theme, avant, gamut))
  return Math.min(...fonds.flatMap((f) => avants.map((a) => contraste(a, f))))
}

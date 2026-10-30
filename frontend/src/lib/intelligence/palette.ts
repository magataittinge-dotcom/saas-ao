// Visage du Compagnon — palette dérivée du bleu d'accent (variable CSS lue à l'exécution).
// Le shader reçoit des couleurs RVB 0..1 en uniform ; rien n'est codé en dur côté composant.

export type Rvb = [number, number, number]

export interface PaletteVisage {
  /** Mélange additif (nuit : les points brillent) ou alpha (clair : une gravure à l'encre). */
  additif: boolean
  deep: Rvb
  mid: Rvb
  ice: Rvb
  peak: Rvb
  gain: number
  base: number
  taille: number
  /** Couleur des fils (« r,g,b » pour rgba()). */
  fil: string
  ambre: string
  halo: boolean
}

export const BLEU_ACCENT_REPLI = '#008cf8'
export const AMBRE_REPLI = '#e7b357'

/** Lit « #rgb », « #rrggbb » ou « rgb(r g b) / rgb(r, g, b) » ; null si illisible. */
export function lireCouleur(texte: string | null | undefined): Rvb | null {
  if (!texte) return null
  const t = texte.trim().toLowerCase()
  let m = t.match(/^#([0-9a-f]{3})$/)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16) / 255) as Rvb
  m = t.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as Rvb
  m = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  return null
}

const borne = (x: number) => Math.max(0, Math.min(1, x))
const vers = (a: Rvb, b: Rvb, t: number): Rvb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(borne) as Rvb
const BLANC: Rvb = [1, 1, 1]
const NOIR: Rvb = [0, 0, 0]
const triplet = (c: Rvb) => c.map((v) => Math.round(v * 255)).join(',')

/** Palette du visage depuis le bleu d'accent et l'ambre d'attention. */
export function paletteDepuisAccent(accent: Rvb, ambre: Rvb, nuit: boolean): PaletteVisage {
  if (nuit) {
    return {
      additif: true, deep: vers(NOIR, accent, 0.3), mid: accent, ice: vers(accent, BLANC, 0.62), peak: vers(accent, BLANC, 0.9),
      gain: 0.9, base: 0.24, taille: 1, fil: triplet(vers(accent, BLANC, 0.55)), ambre: triplet(ambre), halo: true,
    }
  }
  return {
    additif: false, deep: vers(accent, BLANC, 0.6), mid: accent, ice: vers(accent, NOIR, 0.45), peak: vers(accent, NOIR, 0.72),
    gain: 0.96, base: 0.17, taille: 0.92, fil: triplet(accent), ambre: triplet(ambre), halo: false,
  }
}

/** Thème sombre ? On suit data-theme posé sur <html> (« dark » dans le socle ; « nuit » accepté aussi). */
export function estNuit(valeurDataTheme: string | null | undefined): boolean {
  const v = (valeurDataTheme ?? '').toLowerCase()
  return v === 'nuit' || v === 'dark' || v === 'sombre'
}

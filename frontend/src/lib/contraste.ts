// Contraste WCAG 2 de deux couleurs lues à l'écran (#rrggbb ou rgb()/rgba() d'un style calculé).
// Sert à la page /design ; les contrôles de non-régression sont dans tests/jetons.test.ts.
type Rgb = [number, number, number]

export function lireCouleur(texte: string): Rgb | null {
  const t = texte.trim()
  const hex = t.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const rgb = t.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

function luminance([r, g, b]: Rgb): number {
  const c = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

export function rapportContraste(a: string, b: string): number | null {
  const ca = lireCouleur(a)
  const cb = lireCouleur(b)
  if (!ca || !cb) return null
  const [h, l] = [luminance(ca), luminance(cb)].sort((x, y) => y - x)
  return (h + 0.05) / (l + 0.05)
}

// Calculs de couleur partagés par les scripts de la palette et par les tests (aucune dépendance).
// OKLab / OKLCH : Björn Ottosson, « A perceptual color space for image processing » (2020), repris par
// CSS Color 4 (https://www.w3.org/TR/css-color-4/#ok-lab). display-p3 : mêmes courbes de transfert que sRGB,
// primaires P3, blanc D65 (CSS Color 4 § 10.3). Contraste : WCAG 2.x, luminance relative Y (D65).

const cube = (x) => x * x * x

/** Canal sRGB (0..1) → linéaire, et retour. La courbe est la même pour display-p3. */
export const versLineaire = (v) => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4)
export const versGamma = (v) => (Math.abs(v) <= 0.0031308 ? v * 12.92 : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055))

/** sRGB linéaire → OKLab. */
export function lineaireVersOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLab → sRGB linéaire (peut sortir de 0..1 : hors gamut). */
export function oklabVersLineaire([L, a, b]) {
  const l = cube(L + 0.3963377774 * a + 0.2158037573 * b)
  const m = cube(L - 0.1055613458 * a - 0.0638541728 * b)
  const s = cube(L - 0.0894841775 * a - 1.291485548 * b)
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export const oklabVersOklch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
export const oklchVersOklab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]

/** sRGB linéaire ↔ display-p3 linéaire (matrices CSS Color 4, via XYZ D65). */
export function lineaireSrgbVersP3([r, g, b]) {
  return [
    0.8224621724 * r + 0.1775378276 * g + 0 * b,
    0.0331941989 * r + 0.9668058011 * g + 0 * b,
    0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b,
  ]
}
export function lineaireP3VersSrgb([r, g, b]) {
  return [
    1.2249401763 * r - 0.2249401763 * g + 0 * b,
    -0.0420569547 * r + 1.0420569547 * g + 0 * b,
    -0.0196375546 * r - 0.0786360456 * g + 1.0982736002 * b,
  ]
}

const dans = (rgb, marge = 1e-5) => rgb.every((v) => v >= -marge && v <= 1 + marge)
const borne = (v) => Math.min(1, Math.max(0, v))

/** Un OKLCH tient-il dans le gamut ? ('srgb' ou 'p3') */
export function dansGamut(lch, gamut = 'srgb') {
  const lin = oklabVersLineaire(oklchVersOklab(lch))
  return dans(gamut === 'p3' ? lineaireSrgbVersP3(lin) : lin)
}

/** Ramène un OKLCH dans le gamut en baissant la chroma seule : clarté et teinte restent (CSS Color 4 § 13.2, principe). */
export function ramener(lch, gamut = 'srgb') {
  if (dansGamut(lch, gamut)) return lch
  let bas = 0
  let haut = lch[1]
  for (let i = 0; i < 40; i++) {
    const milieu = (bas + haut) / 2
    if (dansGamut([lch[0], milieu, lch[2]], gamut)) bas = milieu
    else haut = milieu
  }
  return [lch[0], bas, lch[2]]
}

/** Chroma maximale d'une teinte à une clarté donnée, dans un gamut. */
export const chromaMax = (L, h, gamut = 'srgb') => ramener([L, 0.5, h], gamut)[1]

const hex2 = (v) => Math.round(borne(v) * 255).toString(16).padStart(2, '0')

/** OKLCH → #rrggbb (chroma réduite si besoin). */
export function oklchVersHex(lch) {
  const lin = oklabVersLineaire(oklchVersOklab(ramener(lch, 'srgb')))
  return '#' + lin.map((v) => hex2(versGamma(v))).join('')
}

/** #rrggbb ou [r,g,b] 0..255 → OKLCH. */
export function hexVersOklch(c) {
  const rgb = typeof c === 'string' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c
  return oklabVersOklch(lineaireVersOklab(rgb.map((v) => versLineaire(v / 255))))
}

/** OKLCH → « color(display-p3 r g b) » (chroma réduite au gamut P3 si besoin). */
export function oklchVersP3(lch) {
  const p3 = lineaireSrgbVersP3(oklabVersLineaire(oklchVersOklab(ramener(lch, 'p3')))).map((v) => borne(versGamma(v)))
  return `color(display-p3 ${p3.map((v) => v.toFixed(4)).join(' ')})`
}

/** Luminance relative (Y, D65) d'une couleur sRGB linéaire. */
export const luminanceLineaire = ([r, g, b]) => 0.2126729 * r + 0.7151522 * g + 0.072175 * b

/** Lit #rrggbb, rgb()/rgba(), oklch(L C h [/ a]) ou color(display-p3 r g b [/ a]) → { lin: sRGB linéaire (hors gamut possible), a }. */
export function lire(c) {
  const s = c.trim()
  let m = s.match(/^#([0-9a-f]{6})$/i)
  if (m) return { lin: [0, 2, 4].map((i) => versLineaire(parseInt(m[1].slice(i, i + 2), 16) / 255)), a: 1 }
  m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/)
  if (m) return { lin: [m[1], m[2], m[3]].map((v) => versLineaire(Number(v) / 255)), a: m[4] === undefined ? 1 : Number(m[4]) }
  m = s.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/)
  if (m) return { lin: oklabVersLineaire(oklchVersOklab([m[2] ? Number(m[1]) / 100 : Number(m[1]), Number(m[3]), Number(m[4])])), a: m[5] === undefined ? 1 : Number(m[5]) }
  m = s.match(/^color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/)
  if (m) return { lin: lineaireP3VersSrgb([m[1], m[2], m[3]].map((v) => versLineaire(Number(v)))), a: m[4] === undefined ? 1 : Number(m[4]) }
  throw new Error(`couleur illisible : ${c}`)
}

/** Toute couleur lisible → OKLCH. */
export const versOklch = (c) => oklabVersOklch(lineaireVersOklab(lire(c).lin))

/** Composition en espace gamma (comme le navigateur) d'une couleur translucide sur un fond opaque → sRGB linéaire. */
export function poser(avant, fond) {
  const f = lire(fond).lin
  const av = lire(avant)
  if (av.a >= 1) return av.lin
  return [0, 1, 2].map((i) => versLineaire(versGamma(av.lin[i]) * av.a + versGamma(f[i]) * (1 - av.a)))
}

/** Contraste WCAG 2 d'une couleur (translucide ou non, sRGB ou P3) sur un fond opaque. */
export function contraste(avant, fond) {
  const a = luminanceLineaire(poser(avant, fond))
  const b = luminanceLineaire(lire(fond).lin)
  const [h, l] = a > b ? [a, b] : [b, a]
  return (h + 0.05) / (l + 0.05)
}

/** Écart de teinte en degrés (0..180). */
export const ecartTeinte = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/** Écart perceptif ΔE OK entre deux OKLab. */
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/** Simulation de dichromatie (Viénot, Brettel, Mollon 1999) sur un sRGB linéaire. */
export function daltonien(lin, type) {
  const [r, g, b] = lin
  // RGB linéaire → LMS (Viénot 1999, primaires proches de sRGB)
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b
  const [l2, m2] = type === 'protanope' ? [2.02344 * M - 2.52581 * S, M] : [L, 0.494207 * L + 1.24827 * S]
  return [
    0.0809444479 * l2 - 0.130504409 * m2 + 0.116721066 * S,
    -0.0102485335 * l2 + 0.0540193266 * m2 - 0.113614708 * S,
    -0.000365296938 * l2 - 0.00412161469 * m2 + 0.693511405 * S,
  ]
}

/** Couleur translucide posée sur un fond opaque → #rrggbb (une couleur opaque est rendue telle quelle). */
export function aplatir(avant, fond) {
  if (lire(avant).a >= 1) return avant
  return '#' + poser(avant, fond).map((v) => hex2(versGamma(v))).join('')
}

/** Couleur vue par un dichromate (ou en vision normale si `type` est vide) → OKLab. */
export function vue(c, type) {
  const lin = lire(c).lin.map(borne)
  return lineaireVersOklab(type ? daltonien(lin, type).map(borne) : lin)
}

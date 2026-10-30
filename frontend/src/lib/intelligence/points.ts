// Visage du Compagnon — lecture du fichier de points « SXV1 » (public/visage/points.bin).
// Fonction pure : aucun accès au DOM, testable sous Node. Le relief est un ellipsoïde
// plus nez, arcades, orbites, lèvres et menton (coordonnées du poster, en pixels).

/** Petit hachage déterministe → [0, 1). */
function h01(i: number, graine: number): number {
  let x = (i + 1) * 374761393 + graine * 668265263
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  x = x ^ (x >>> 16)
  return (x >>> 0) / 4294967296
}

const gauss = (x: number, y: number, x0: number, y0: number, sx: number, sy: number) =>
  Math.exp(-(((x - x0) ** 2) / (2 * sx * sx) + ((y - y0) ** 2) / (2 * sy * sy)))

export interface DonneesVisage {
  /** Nombre total de points (visage + poussière). */
  n: number
  /** Points du visage seulement. */
  nVisage: number
  /** Positions x, y, z (Float32 ×3). */
  pos: Float32Array
  /** Attributs par point (Uint8 ×4) : luminosité yeux ouverts, yeux fermés, taille, iris. */
  att: Uint8Array
  /** Six points d'accroche des fils vers les bulles (x, y, z ×6). */
  ancres: Float32Array
}

export const MAGIE_POINTS = 'SXV1'
export const NB_ANCRES = 6

/** Vrai si le tampon commence par la signature du fichier de points. */
export function estFichierPoints(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 80) return false
  const dv = new DataView(buffer)
  return String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) === MAGIE_POINTS
}

/** Lit le fichier de points et fabrique positions et attributs. */
export function decoderPoints(buffer: ArrayBuffer, { poussiere = 420 }: { poussiere?: number } = {}): DonneesVisage {
  if (!estFichierPoints(buffer)) throw new Error('fichier de points inconnu')
  const dv = new DataView(buffer)
  const n = dv.getUint32(8, true)
  const nYeux = dv.getUint32(12, true)
  const W = dv.getUint16(16, true)
  const CASE = dv.getUint8(20)
  if (!n || !CASE || !W) throw new Error('fichier de points invalide')
  const i16 = (o: number) => dv.getInt16(o, true)
  const [cx, cy, ax, ay] = [i16(24), i16(26), i16(28), i16(30)]
  const yeux: [number, number][] = [[i16(32), i16(34)], [i16(36), i16(38)]]
  const [irisR, zx, zy] = [i16(40), i16(42), i16(44)]
  const ancresPx: [number, number][] = []
  for (let k = 0; k < NB_ANCRES; k++) ancresPx.push([i16(46 + k * 4), i16(48 + k * 4)])
  const G = W / CASE
  const tailleOcc = (G * G) >> 3
  if (buffer.byteLength < 80 + tailleOcc + n + nYeux) throw new Error('fichier de points tronqué')
  const occ = new Uint8Array(buffer, 80, tailleOcc)
  const bo = new Uint8Array(buffer, 80 + tailleOcc, n)
  const bf = new Uint8Array(buffer, 80 + tailleOcc + n, nYeux)

  const relief = (x: number, y: number) => {
    const dx = (x - cx) / ax
    const dy = (y - cy) / ay
    const r2 = dx * dx + dy * dy
    let z = r2 < 1 ? Math.sqrt(1 - r2) * ax * 0.95 : -Math.min(1, (Math.sqrt(r2) - 1) * 4) * ax * 0.3
    z += 34 * gauss(x, y, 320, 372, 13, 32) + 10 * gauss(x, y, 320, 315, 9, 28)
    z -= 12 * (gauss(x, y, yeux[0][0], yeux[0][1], 24, 15) + gauss(x, y, yeux[1][0], yeux[1][1], 24, 15))
    z += 7 * (gauss(x, y, yeux[0][0], 268, 30, 9) + gauss(x, y, yeux[1][0], 268, 30, 9))
    z += 9 * gauss(x, y, 320, 438, 34, 12) + 7 * gauss(x, y, 320, 494, 40, 16)
    return z
  }
  const dansOeil = (x: number, y: number) => yeux.some(([ex, ey]) => ((x - ex) / zx) ** 2 + ((y - ey) / zy) ** 2 <= 1)

  const total = n + poussiere
  const pos = new Float32Array(total * 3)
  const att = new Uint8Array(total * 4)
  let k = 0
  let e = 0
  for (let i = 0; i < G * G && k < n; i++) {
    if (!(occ[i >> 3] & (1 << (i & 7)))) continue
    const gx = i % G
    const gy = (i / G) | 0
    const x0 = gx * CASE
    const y0 = gy * CASE
    const x = x0 + h01(k, 1) * CASE
    const y = y0 + h01(k, 2) * CASE
    const ouvert = bo[k]
    const ferme = dansOeil(x0 + 1, y0 + 1) ? bf[e++] : ouvert
    const dIris = Math.min(Math.hypot(x - yeux[0][0], y - yeux[0][1]), Math.hypot(x - yeux[1][0], y - yeux[1][1]))
    const iris = Math.max(0, Math.min(1, 1 - (dIris - irisR) / 4))
    pos[k * 3] = (x - cx) / ay
    pos[k * 3 + 1] = -(y - cy) / ay
    pos[k * 3 + 2] = relief(x, y) / ay
    att[k * 4] = ouvert
    att[k * 4 + 1] = ferme
    att[k * 4 + 2] = Math.round(30 + 200 * h01(k, 3) ** 2.2)
    att[k * 4 + 3] = Math.round(255 * iris)
    k++
  }
  // Poussière : une coquille clairsemée autour de la tête (générée, rien à télécharger).
  for (let j = 0; j < poussiere; j++, k++) {
    const u = h01(j, 11) * 2 - 1
    const th = h01(j, 12) * Math.PI * 2
    const rr = 1.12 + h01(j, 13) ** 0.8 * 0.85
    const s = Math.sqrt(1 - u * u)
    pos[k * 3] = Math.cos(th) * s * rr * 0.86
    pos[k * 3 + 1] = u * rr
    pos[k * 3 + 2] = Math.sin(th) * s * rr * 0.45
    const b = 16 + Math.floor(h01(j, 14) * 64)
    att[k * 4] = b
    att[k * 4 + 1] = b
    att[k * 4 + 2] = Math.floor(h01(j, 15) * 110)
    att[k * 4 + 3] = 0
  }
  const ancres = new Float32Array(NB_ANCRES * 3)
  ancresPx.forEach(([x, y], j) => {
    ancres[j * 3] = (x - cx) / ay
    ancres[j * 3 + 1] = -(y - cy) / ay
    ancres[j * 3 + 2] = relief(x, y) / ay
  })
  return { n: total, nVisage: n, pos, att, ancres }
}

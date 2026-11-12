// C2 — « Voir les différences » : la différence mot à mot entre le passage d'origine et une proposition.
// Plus longue sous-suite commune sur les mots (espaces gardés avec le mot qui les précède) : déterministe, sans IA.
// Un passage fait 6 000 caractères au plus (≈ 1 000 mots) : la table tient en mémoire sans peine.

export type Morceau = { sorte: 'pareil' | 'retire' | 'ajoute'; texte: string }

/** Les mots et leurs espaces : « Nous posons » → ['Nous ', 'posons']. Rejoints, ils redonnent le texte exact. */
export function mots(texte: string): string[] {
  return texte.match(/\S+\s*|\s+/g) ?? []
}

const MAX_MOTS = 2500

/** Les morceaux, dans l'ordre de lecture ; deux morceaux voisins de même sorte sont fusionnés. */
export function differences(avant: string, apres: string): Morceau[] {
  const a = mots(avant)
  const b = mots(apres)
  if (a.length > MAX_MOTS || b.length > MAX_MOTS) {
    return fusionner([{ sorte: 'retire', texte: avant }, { sorte: 'ajoute', texte: apres }])
  }
  const cle = (m: string) => m.trim()
  const n = a.length
  const m = b.length
  // longueur[i][j] = plus longue sous-suite commune de a[i..] et b[j..]
  const longueur: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      longueur[i][j] = cle(a[i]) === cle(b[j]) ? longueur[i + 1][j + 1] + 1 : Math.max(longueur[i + 1][j], longueur[i][j + 1])
    }
  }
  const sortie: Morceau[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (cle(a[i]) === cle(b[j])) { sortie.push({ sorte: 'pareil', texte: b[j] }); i++; j++ }
    else if (longueur[i + 1][j] >= longueur[i][j + 1]) { sortie.push({ sorte: 'retire', texte: a[i] }); i++ }
    else { sortie.push({ sorte: 'ajoute', texte: b[j] }); j++ }
  }
  while (i < n) sortie.push({ sorte: 'retire', texte: a[i++] })
  while (j < m) sortie.push({ sorte: 'ajoute', texte: b[j++] })
  return fusionner(sortie)
}

function fusionner(morceaux: Morceau[]): Morceau[] {
  const out: Morceau[] = []
  for (const x of morceaux) {
    if (!x.texte) continue
    const dernier = out[out.length - 1]
    if (dernier && dernier.sorte === x.sorte) dernier.texte += x.texte
    else out.push({ ...x })
  }
  return out
}

/** Le nombre de mots changés : un mot remplacé compte une fois (le plus grand des retirés et des ajoutés), pour dire
 * l'ampleur d'une proposition sans la juger. */
export function motsChanges(morceaux: readonly Morceau[]): number {
  const compte = (sorte: Morceau['sorte']) => morceaux.filter((x) => x.sorte === sorte)
    .reduce((t, x) => t + mots(x.texte).filter((w) => w.trim()).length, 0)
  return Math.max(compte('retire'), compte('ajoute'))
}

/** Un morceau changé sans ses blancs de fin : le trait (barré, souligné) s'arrête au dernier mot. */
export function sansBlancFinal(texte: string): [string, string] {
  const m = /^([\s\S]*?)(\s*)$/.exec(texte)
  return m ? [m[1], m[2]] : [texte, '']
}

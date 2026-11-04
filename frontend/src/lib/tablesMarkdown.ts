/**
 * Tableaux Markdown du mémoire (`| a | b |` + ligne `|---|---|`) : le moteur de rendu du lecteur ne les connaît pas
 * (pas de GFM, aucune dépendance en plus). On découpe le texte en blocs de texte et en tableaux, que le lecteur rend
 * lui-même, comme le Word.
 */
export type Alignement = 'left' | 'center' | 'right' | null
export type SegmentTexte = { type: 'texte'; texte: string }
export type SegmentTable = { type: 'table'; entetes: string[]; alignements: Alignement[]; lignes: string[][] }
export type Segment = SegmentTexte | SegmentTable

/** Cellules d'une ligne `| a | b |` ; `\|` reste une barre dans la cellule. */
function cellules(ligne: string): string[] {
  let t = ligne.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

const estLigneTable = (l: string) => l.trim().startsWith('|') && l.trim().length > 1
const estSeparateur = (l: string) => estLigneTable(l) && cellules(l).every((c) => /^:?-{1,}:?$/.test(c))

function alignement(c: string): Alignement {
  const g = c.startsWith(':')
  const d = c.endsWith(':')
  return g && d ? 'center' : d ? 'right' : g ? 'left' : null
}

export function decouperTables(texte: string): Segment[] {
  const lignes = texte.split('\n')
  const segments: Segment[] = []
  let courant: string[] = []
  const viderTexte = () => {
    if (courant.length === 0) return
    const t = courant.join('\n')
    if (t.trim() !== '') segments.push({ type: 'texte', texte: t })
    courant = []
  }
  let i = 0
  while (i < lignes.length) {
    if (estLigneTable(lignes[i]) && i + 1 < lignes.length && estSeparateur(lignes[i + 1])) {
      const entetes = cellules(lignes[i])
      const aligns = cellules(lignes[i + 1]).map(alignement)
      let j = i + 2
      const corps: string[][] = []
      while (j < lignes.length && estLigneTable(lignes[j])) {
        const c = cellules(lignes[j])
        corps.push(entetes.map((_, k) => c[k] ?? ''))
        j++
      }
      viderTexte()
      segments.push({ type: 'table', entetes, alignements: entetes.map((_, k) => aligns[k] ?? null), lignes: corps })
      i = j
    } else {
      courant.push(lignes[i])
      i++
    }
  }
  viderTexte()
  return segments.length ? segments : [{ type: 'texte', texte }]
}

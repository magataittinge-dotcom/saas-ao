// Ce que l'écran de lecture du mémoire fait du texte enregistré, SANS le changer (le texte reste celui de la base, que
// l'éditeur montre tel quel) : il le dessine comme le document qui sera déposé.
//  - `retirerConsignes` : les notes de l'outil restées entre crochets (« [Ici : … la carte est dessinée par Synorix … ] »,
//    « [L'organigramme visuel … ] », « [Insérer une photo … ] ») ne sont jamais imprimées dans le Word
//    (backend/services/docx_exporter.py, `_CONSIGNE_RE` et `_retirer_consignes` : même règle, même résultat) ; l'écran ne
//    les montre pas non plus. Un « [À COMPLÉTER : … ] » n'en est pas une : il reste, surligné et compté.
//  - `lireArbre` : un schéma tapé au clavier (« └── Directeur Travaux (…) ») redevient un arbre, que l'écran dessine.
//  - `titreEnTete` : le titre que le texte d'une partie porte en première ligne, pour ne l'écrire qu'une fois.

const CONSIGNE = new RegExp(
  String.raw`\[\s*(?:ici\s*:|l['’]organigramme(?![\p{L}\p{N}_])|(?:ins[ée]rer|ins[ée]rez|ajouter|ajoutez)(?![\p{L}\p{N}_])`
  + String.raw`|(?:image|photo|sch[ée]ma|visuel|carte|plan|logo)(?![\p{L}\p{N}_]))[^\]\n]{0,600}\](?!\()`
  + String.raw`|\[[^\]\n]{0,600}(?<![\p{L}\p{N}_])synorix(?![\p{L}\p{N}_])[^\]\n]{0,600}\](?!\()`,
  'giu',
)

/** Retire les consignes et notes de l'outil entre crochets ; une ligne qui n'était que cela disparaît. */
export function retirerConsignes(texte: string): string {
  const lignes: string[] = []
  for (const ligne of texte.split('\n')) {
    CONSIGNE.lastIndex = 0
    if (!CONSIGNE.test(ligne)) { lignes.push(ligne); continue }
    const reste = ligne.replace(CONSIGNE, '')
    if (reste.trim()) lignes.push(reste.replace(/ {2,}/g, ' ').trimEnd())
  }
  return lignes.join('\n')
}

export interface NoeudArbre {
  /** Le nom du poste : « Directeur Travaux ». */
  texte: string
  /** Ce qui suit entre parenthèses, sans elles : « pilotage global, engagements contractuels ». */
  detail: string | null
  enfants: NoeudArbre[]
}

const BRANCHE = /^([\s│|]*)(?:[├└╰┣┗]\s*[─━-]{1,3}\s*)(.*)$/

/**
 * Lit un arbre tapé au clavier. Le niveau d'une ligne est la colonne où son texte commence ; une ligne sans branche est
 * une racine. Rend `null` si le bloc n'est pas un arbre (aucune branche, une seule ligne, une ligne vide de texte) : le
 * bloc garde alors son rendu ordinaire.
 */
export function lireArbre(brut: string): NoeudArbre[] | null {
  const lignes = brut.replace(/\t/g, '    ').split('\n').filter((l) => l.trim() && !/^[\s│|]+$/.test(l))
  if (lignes.length < 2) return null
  const racines: NoeudArbre[] = []
  const pile: { colonne: number; noeud: NoeudArbre }[] = []
  let branches = 0
  for (const ligne of lignes) {
    const m = BRANCHE.exec(ligne)
    if (m) branches += 1
    const texteBrut = (m ? m[2] : ligne).trim()
    if (!texteBrut) return null
    const colonne = m ? ligne.length - m[2].length : ligne.length - ligne.trimStart().length
    const parentheses = /^(.*?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(texteBrut)
    const noeud: NoeudArbre = parentheses && parentheses[1].trim()
      ? { texte: parentheses[1].trim(), detail: parentheses[2].trim(), enfants: [] }
      : { texte: texteBrut, detail: null, enfants: [] }
    while (pile.length > 0 && pile[pile.length - 1].colonne >= colonne) pile.pop()
    if (pile.length === 0) racines.push(noeud)
    else pile[pile.length - 1].noeud.enfants.push(noeud)
    pile.push({ colonne, noeud })
  }
  return branches > 0 ? racines : null
}

/**
 * Le titre que le texte d'une partie porte en première ligne (« ## A.1 — Implantation géographique et proximité du
 * chantier ») et le texte sans cette ligne. L'écran écrit ce titre une fois, à la place du titre du plan, au lieu de
 * deux titres qui se suivent. Sans titre en tête (ou un titre qui porte un passage entre crochets) : `titre` est nul et
 * le texte est rendu tel quel.
 */
export function titreEnTete(texte: string): { titre: string | null; corps: string } {
  const m = /^\s*#{1,3}[ \t]+([^\n]+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(texte)
  if (!m || /[[\]]/.test(m[1])) return { titre: null, corps: texte }
  const titre = m[1].replace(/[*_`]/g, '').trim()
  if (!titre) return { titre: null, corps: texte }
  return { titre, corps: texte.slice(m[0].length).replace(/^\n+/, '') }
}

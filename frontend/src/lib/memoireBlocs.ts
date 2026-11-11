// L'éditeur du mémoire montre le texte mis en forme et ne montre plus aucun signe (« # », « ** », « | »).
// Le texte enregistré ne change pas de format : c'est toujours celui de `versMarkdown`. Ici, on le découpe en blocs
// (un titre, un paragraphe, une ligne de liste, un tableau) qui ne font que désigner des lignes du texte :
// - `assembler(decouper(t)) === t` pour tout texte (les blocs gardent leurs lignes telles quelles) ;
// - modifier un bloc ne remplace que ses lignes ; les autres ne sont jamais réécrites ;
// - à l'intérieur d'un bloc, `lireFragments` et `ecrireFragments` sont inverses l'un de l'autre, signe pour signe.
// Fonctions pures, sans navigateur : la lecture du texte saisi passe par une forme minimale de nœud (`NoeudLu`).

export type TypeBloc = 'vide' | 'structure' | 'filet' | 'titre' | 'puce' | 'paragraphe' | 'table' | 'cloture'

export interface Bloc {
  /** Identité stable d'un bloc à l'écran (elle survit aux modifications des autres blocs). */
  id: number
  type: TypeBloc
  /** Les lignes du texte que ce bloc désigne, telles quelles. */
  lignes: string[]
}

const TITRE = /^(#{1,6})[ \t]+/
const PUCE = /^([ \t]*)(?:[-*+]|(\d+)[.)])[ \t]+/
const CLOTURE = /^[ \t]*(```|~~~)/
const estLigneTable = (l: string) => l.trim().startsWith('|') && l.trim().length > 1

/** Le signe en tête d'une ligne de titre ou de liste (« ### », « - », « 1. »), que l'écran ne montre pas. */
export function prefixeDe(ligne: string): string {
  return ligne.match(TITRE)?.[0] ?? ligne.match(PUCE)?.[0] ?? ''
}
export const niveauTitre = (ligne: string): number => ligne.match(TITRE)?.[1].length ?? 0
export const estNumerotee = (ligne: string): boolean => ligne.match(PUCE)?.[2] !== undefined
export const retraitPuce = (ligne: string): number => Math.floor((ligne.match(PUCE)?.[1].replace(/\t/g, '  ').length ?? 0) / 2)

function typeLigne(ligne: string, structure: ReadonlySet<string>): TypeBloc {
  if (ligne.trim() === '') return 'vide'
  if (structure.has(ligne)) return 'structure'
  if (ligne === '---') return 'filet'
  if (CLOTURE.test(ligne)) return 'cloture'
  if (TITRE.test(ligne)) return 'titre'
  if (PUCE.test(ligne)) return 'puce'
  if (estLigneTable(ligne)) return 'table'
  return 'paragraphe'
}

let compteur = 0
const nouvelId = () => { compteur += 1; return compteur }

/**
 * Le texte de l'éditeur en blocs. `structure` : les titres qui découpent le mémoire en parties et en sections
 * (`titresEditeur`) : ils se lisent, ils ne se modifient pas (les changer déplacerait le texte d'une section à l'autre).
 */
export function decouper(texte: string, structure: ReadonlySet<string> = new Set()): Bloc[] {
  const blocs: Bloc[] = []
  let dansCloture = false
  for (const ligne of texte.split('\n')) {
    let type = typeLigne(ligne, structure)
    if (dansCloture && type !== 'cloture') type = ligne.trim() === '' ? 'vide' : 'paragraphe'
    if (type === 'cloture') dansCloture = !dansCloture
    const dernier = blocs[blocs.length - 1]
    // Un paragraphe et un tableau tiennent sur plusieurs lignes ; tout le reste : une ligne, un bloc.
    if (dernier && dernier.type === type && (type === 'paragraphe' || type === 'table')) dernier.lignes.push(ligne)
    else blocs.push({ id: nouvelId(), type, lignes: [ligne] })
  }
  return blocs
}

/** Inverse exact de `decouper`. */
export const assembler = (blocs: readonly Bloc[]): string => blocs.flatMap((b) => b.lignes).join('\n')

/**
 * Remplace les lignes d'un bloc, puis redécoupe. Les blocs d'avant et d'après gardent leur identité (et leurs lignes) :
 * seul le passage modifié change.
 */
export function remplacerBloc(blocs: readonly Bloc[], id: number, lignes: readonly string[], structure: ReadonlySet<string> = new Set()): Bloc[] {
  const i = blocs.findIndex((b) => b.id === id)
  if (i < 0) return [...blocs]
  const suite = decouper(assembler([...blocs.slice(0, i), { ...blocs[i], lignes: [...lignes] }, ...blocs.slice(i + 1)]), structure)
  // Identités reprises par le début, puis par la fin, tant que les lignes sont les mêmes.
  const memes = (a: Bloc, b: Bloc) => a.type === b.type && a.lignes.length === b.lignes.length && a.lignes.every((l, k) => l === b.lignes[k])
  let debut = 0
  while (debut < suite.length && debut < blocs.length && memes(suite[debut], blocs[debut])) { suite[debut] = blocs[debut]; debut += 1 }
  let fin = 0
  while (fin < suite.length - debut && fin < blocs.length - debut && memes(suite[suite.length - 1 - fin], blocs[blocs.length - 1 - fin])) {
    suite[suite.length - 1 - fin] = blocs[blocs.length - 1 - fin]
    fin += 1
  }
  // Le bloc modifié garde son identité quand il reste seul à sa place (la saisie ne perd pas sa place à l'écran).
  if (suite.length === blocs.length && suite.length - debut - fin === 1 && suite[debut].type === blocs[i].type) suite[debut].id = id
  return suite
}

/** Position, dans le texte assemblé, du premier et du dernier caractère d'un bloc. */
export function bornesBloc(blocs: readonly Bloc[], id: number): { debut: number; fin: number } | null {
  let position = 0
  for (const b of blocs) {
    const longueur = b.lignes.join('\n').length
    if (b.id === id) return { debut: position, fin: position + longueur }
    position += longueur + 1
  }
  return null
}

// ── À l'intérieur d'un bloc : gras, italique, passages « à compléter » ─────────────────────────────────────────────

export type Fragment =
  | { type: 'texte'; texte: string }
  | { type: 'gras'; texte: string }
  | { type: 'italique'; texte: string }
  /** `brut` : le passage tel qu'il est enregistré ; `texte` : ce que l'écran en dit. */
  | { type: 'a_completer'; brut: string; texte: string }

const A_COMPLETER = /\[\s*[ÀA] COMPL[ÉE]TER(?: PAR L['’]ENTREPRISE)?\s*:?\s*([^\]]*)\]/
const SIGNES = new RegExp(`\\*\\*([^*\\n]+)\\*\\*|\\*([^*\\s][^*\\n]*)\\*|${A_COMPLETER.source}`, 'g')

/** « [À COMPLÉTER PAR L'ENTREPRISE : adresse du siège] » se lit « À compléter : adresse du siège », comme dans le Word. */
export function libelleACompleter(brut: string): string {
  const objet = (brut.match(A_COMPLETER)?.[1] ?? '').trim()
  return objet ? `À compléter : ${objet}` : 'À compléter'
}

/** L'ancre qui désigne, pour le lecteur du mémoire, un passage à surligner. */
export const ANCRE_A_COMPLETER = '#a-renseigner'

/** Pour le lecteur (affichage seul) : chaque passage devient un lien vers `ANCRE_A_COMPLETER`, que le lecteur rend surligné. */
export const afficherACompleter = (texte: string): string =>
  texte.replace(new RegExp(A_COMPLETER.source, 'g'), (brut) => `[${libelleACompleter(brut).replace(/([\\[\]*_`])/g, '\\$1')}](${ANCRE_A_COMPLETER})`)

/** Vrai si le texte porte un passage « à compléter ». */
export const contientACompleter = (texte: string): boolean => A_COMPLETER.test(texte)

/** Le texte d'un bloc en fragments. Tout ce qui n'est ni gras, ni italique, ni « à compléter » reste du texte, tel quel. */
export function lireFragments(texte: string): Fragment[] {
  const fragments: Fragment[] = []
  let position = 0
  for (const m of texte.matchAll(SIGNES)) {
    const i = m.index ?? 0
    if (i > position) fragments.push({ type: 'texte', texte: texte.slice(position, i) })
    if (m[1] !== undefined) fragments.push({ type: 'gras', texte: m[1] })
    else if (m[2] !== undefined) fragments.push({ type: 'italique', texte: m[2] })
    else fragments.push({ type: 'a_completer', brut: m[0], texte: libelleACompleter(m[0]) })
    position = i + m[0].length
  }
  if (position < texte.length) fragments.push({ type: 'texte', texte: texte.slice(position) })
  return fragments
}

/** Entoure un passage de son signe ; les espaces des bords restent dehors (« **mot** », jamais « ** mot** »). */
function marquer(texte: string, signe: string): string {
  if (texte.trim() === '') return texte
  const m = texte.match(/^(\s*)([\s\S]*?)(\s*)$/)
  return m ? `${m[1]}${signe}${m[2]}${signe}${m[3]}` : texte
}

/** Inverse exact de `lireFragments`. */
export function ecrireFragments(fragments: readonly Fragment[]): string {
  return fragments.map((f) => (
    f.type === 'gras' ? marquer(f.texte, '**')
      : f.type === 'italique' ? marquer(f.texte, '*')
        : f.type === 'a_completer' ? f.brut
          : f.texte
  )).join('')
}

const echapperHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const echapperAttribut = (t: string) => echapperHtml(t).replace(/"/g, '&quot;')

/** Le texte d'un bloc tel que la zone de saisie le montre : gras en gras, italique en italique, « À compléter » surligné.
 *  Tout le texte est échappé (« & », « < », « > », guillemets des attributs) : aucune balise du texte n'arrive dans la page. */
export function htmlFragments(texte: string): string {
  return lireFragments(texte).map((f) => (
    f.type === 'gras' ? `<strong>${echapperHtml(f.texte)}</strong>`
      : f.type === 'italique' ? `<em>${echapperHtml(f.texte)}</em>`
        : f.type === 'a_completer' ? `<mark class="a-renseigner" contenteditable="false" data-brut="${echapperAttribut(f.brut)}">${echapperHtml(f.texte)}</mark>`
          : echapperHtml(f.texte)
  )).join('')
}

/** Ce qu'il faut d'un nœud du navigateur pour relire une saisie (un `Node` y répond). */
export interface NoeudLu {
  nodeType: number
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<NoeudLu>
  getAttribute?: (nom: string) => string | null
}

const BLOCS_HTML = new Set(['DIV', 'P', 'LI'])

function lireNoeud(n: NoeudLu, dernier: boolean): string {
  if (n.nodeType === 3) return n.textContent ?? ''
  if (n.nodeType !== 1) return ''
  const nom = n.nodeName.toUpperCase()
  // Le navigateur pose un retour de ligne en fin de zone pour tenir le curseur : ce n'est pas du texte.
  if (nom === 'BR') return dernier ? '' : '\n'
  if (nom === 'MARK') {
    const brut = n.getAttribute?.('data-brut')
    if (brut && (n.textContent ?? '') === libelleACompleter(brut)) return brut
    return n.textContent ?? ''
  }
  const dedans = lireEnfants(n)
  if (nom === 'STRONG' || nom === 'B') return marquer(dedans, '**')
  if (nom === 'EM' || nom === 'I') return marquer(dedans, '*')
  if (BLOCS_HTML.has(nom)) return `\n${dedans}`
  return dedans
}

function lireEnfants(n: NoeudLu): string {
  const enfants = Array.from(n.childNodes)
  return enfants.map((e, i) => lireNoeud(e, i === enfants.length - 1)).join('')
}

/** Relit une zone de saisie : inverse de `htmlFragments` (une zone non touchée rend son texte au caractère près). */
export const texteDeLaSaisie = (racine: NoeudLu): string => lireEnfants(racine)

// ── Tableaux : une cellule se corrige seule, ses barres et ses espaces ne bougent pas ───────────────────────────────

/** Les morceaux d'une ligne de tableau, barres retirées, espaces gardés : `morceaux.join('|')` redonne la ligne. */
export const morceauxLigneTable = (ligne: string): string[] => ligne.split(/(?<!\\)\|/)

/** Remplace le texte d'une cellule (numérotée parmi les morceaux) en gardant les espaces qui l'entourent. */
export function remplacerCellule(ligne: string, morceau: number, texte: string): string {
  const morceaux = morceauxLigneTable(ligne)
  if (morceau < 0 || morceau >= morceaux.length) return ligne
  const m = morceaux[morceau].match(/^(\s*)[\s\S]*?(\s*)$/)
  const propre = texte.replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim()
  morceaux[morceau] = `${m?.[1] || ' '}${propre}${m?.[2] || ' '}`
  return morceaux.join('|')
}

/** Vrai pour la ligne « |---|---| » qui sépare les titres du tableau de ses lignes. */
export const estSeparateurTable = (ligne: string): boolean => {
  const cellules = morceauxLigneTable(ligne.trim()).slice(1, -1)
  return cellules.length > 0 && cellules.every((c) => /^\s*:?-+:?\s*$/.test(c))
}

/** Les cellules visibles d'une ligne de tableau : leur texte et leur numéro de morceau (pour `remplacerCellule`). */
export function cellulesLigneTable(ligne: string): { morceau: number; texte: string }[] {
  const morceaux = morceauxLigneTable(ligne)
  const debut = ligne.trimStart().startsWith('|') ? 1 : 0
  const fin = /(?<!\\)\|\s*$/.test(ligne) ? morceaux.length - 1 : morceaux.length
  return morceaux.slice(debut, fin).map((c, k) => ({ morceau: debut + k, texte: c.trim().replace(/\\\|/g, '|') }))
}

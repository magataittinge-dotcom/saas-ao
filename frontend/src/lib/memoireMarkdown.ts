// Aller-retour exact entre le mémoire (JSON par sections) et le texte de
// l'éditeur (Markdown). depuisMarkdown(versMarkdown(c), c) redonne c octet pour
// octet, quel que soit le contenu (1.8) :
// - seules les lignes de titre émises ici séparent les sections ; un sous-titre
//   généré (« ### Environnement ») reste dans sa section ;
// - une ligne de contenu identique à un titre d'éditeur est échappée par « \ »
//   (une barre de plus à chaque niveau), et désescapée à la relecture ;
// - le séparateur « --- » posé avant chaque partie est retiré exactement.
import type { MemoireContent } from '@/types'
import { PARTIES, TITRES_PARTIES, sectionsDuContenu, type PartieId, type SectionMemoire } from '@/lib/memoireSections'

const TITRE_PREAMBULE = '# PRÉAMBULE'
const SEPARATEUR = '---'
const titrePartie = (p: PartieId) => `# ${TITRES_PARTIES[p]}`
const titreSection = (s: SectionMemoire) => `## ${s.titre}`

/** Les titres d'éditeur d'un mémoire (ceux de son plan suivi, ou du modèle) : seuls à séparer des sections. */
function titresDe(sections: readonly SectionMemoire[]): ReadonlySet<string> {
  return new Set([TITRE_PREAMBULE, ...PARTIES.map(titrePartie), ...sections.map(titreSection)])
}

/** Les titres qui découpent le texte de l'éditeur pour ce mémoire : l'éditeur les montre, il ne les laisse pas modifier. */
export const titresEditeur = (content: MemoireContent): ReadonlySet<string> => titresDe(sectionsDuContenu(content))

/** Les trois gestes d'échappement, pour un jeu de titres donné. */
function echappement(titres: ReadonlySet<string>) {
  /** Ligne de contenu qui ressemble à un titre d'éditeur, échappée ou non. */
  const estTitreOuEchappe = (ligne: string): boolean => titres.has(ligne.replace(/^\\+/, ''))
  return {
    echapper: (ligne: string) => (estTitreOuEchappe(ligne) ? `\\${ligne}` : ligne),
    desechapper: (ligne: string) => (ligne.startsWith('\\') && estTitreOuEchappe(ligne) ? ligne.slice(1) : ligne),
  }
}

function texteDe(partie: unknown, cle: string): string {
  const v = (partie as Record<string, unknown> | undefined)?.[cle]
  return typeof v === 'string' ? v : ''
}

/** Le mémoire en un seul texte Markdown, pour l'éditeur. */
export function versMarkdown(content: MemoireContent): string {
  const sections = sectionsDuContenu(content)
  const { echapper } = echappement(titresDe(sections))
  const lignesDe = (texte: string): string[] => texte.split('\n').map(echapper)
  const lignes: string[] = [TITRE_PREAMBULE, '', ...lignesDe(content.preambule ?? ''), '']
  for (const p of PARTIES) {
    lignes.push(SEPARATEUR, '', titrePartie(p), '')
    for (const s of sections.filter((x) => x.part === p)) {
      const texte = texteDe(content[p], s.cle)
      if (texte) lignes.push(titreSection(s), '', ...lignesDe(texte), '')
    }
  }
  return lignes.join('\n')
}

type Cible = { type: 'preambule' } | { type: 'partie'; part: PartieId } | { type: 'section'; section: SectionMemoire }

/** Relit le texte de l'éditeur. Les sections absentes du texte gardent leur contenu d'origine. */
export function depuisMarkdown(raw: string, original: MemoireContent): MemoireContent {
  const sections = sectionsDuContenu(original)
  const { desechapper } = echappement(titresDe(sections))
  const resultat = {
    ...original,
    partie_a: { ...original.partie_a },
    partie_b: { ...original.partie_b },
    partie_c: { ...original.partie_c },
  } as MemoireContent
  const blocs: { cible: Cible; lignes: string[] }[] = []
  let partieCourante: PartieId | null = null

  for (const ligne of raw.split('\n')) {
    let cible: Cible | null = null
    if (ligne === TITRE_PREAMBULE && partieCourante === null) cible = { type: 'preambule' }
    const p = PARTIES.find((x) => ligne === titrePartie(x))
    if (p) cible = { type: 'partie', part: p }
    if (!cible && partieCourante) {
      const s = sections.find((x) => x.part === partieCourante && ligne === titreSection(x))
      if (s) cible = { type: 'section', section: s }
    }
    if (cible) {
      if (cible.type === 'partie') partieCourante = cible.part
      blocs.push({ cible, lignes: [] })
    } else {
      // Texte placé avant tout titre (titre « PRÉAMBULE » effacé) : il reste au préambule.
      if (blocs.length === 0) blocs.push({ cible: { type: 'preambule' }, lignes: [] })
      blocs[blocs.length - 1].lignes.push(ligne)
    }
  }

  // Inverse exact de versMarkdown : « --- » + ligne vide avant une partie,
  // une ligne vide après chaque titre et après chaque texte.
  const textes = blocs.map((b, i) => {
    const l = [...b.lignes]
    const suivant = blocs[i + 1]
    if (suivant?.cible.type === 'partie' && l.length >= 2 && l[l.length - 2] === SEPARATEUR && l[l.length - 1] === '') {
      l.splice(-2, 2)
    }
    if (l[0] === '') l.shift()
    if (l.length > 0 && l[l.length - 1] === '') l.pop()
    return l.map(desechapper).join('\n')
  })

  // Texte saisi entre un titre de partie et sa première section : rattaché
  // au début de la section suivante (ou à la fin du bloc précédent) — jamais perdu.
  const contenus = new Map<string, string[]>()
  const ajouter = (cle: string, texte: string) => contenus.set(cle, [...(contenus.get(cle) ?? []), texte])
  let enAttente: string[] = []
  blocs.forEach((b, i) => {
    const texte = textes[i]
    if (b.cible.type === 'partie') {
      if (texte.trim()) enAttente.push(texte)
      return
    }
    const cle = b.cible.type === 'preambule' ? 'preambule' : `${b.cible.section.part}.${b.cible.section.cle}`
    ajouter(cle, [...enAttente, texte].join('\n\n'))
    enAttente = []
  })
  if (enAttente.length > 0) {
    const derniere = [...contenus.keys()].pop() ?? 'preambule'
    ajouter(derniere, enAttente.join('\n\n'))
  }

  for (const [cle, morceaux] of contenus) {
    const texte = morceaux.join('\n\n')
    if (cle === 'preambule') {
      resultat.preambule = texte
    } else {
      const [part, sous] = cle.split('.') as [PartieId, string]
      ;(resultat[part] as unknown as Record<string, string>)[sous] = texte
    }
  }
  return resultat
}

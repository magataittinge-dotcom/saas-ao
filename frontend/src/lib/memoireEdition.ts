// Les gestes de la barre d'outils de l'éditeur du mémoire : ils posent les signes de mise en forme à la place de l'utilisateur
// (qui n'a pas à les connaître). Fonctions pures : le texte, la sélection → le nouveau texte, la nouvelle sélection.
// Les titres de l'éditeur (« # PARTIE… », « ## 1. Section ») séparent les sections (lib/memoireMarkdown.ts) : « Titre » pose
// donc un « ### », qui reste dans sa section.

export interface Saisie {
  texte: string
  debut: number
  fin: number
}

export type Geste = 'titre' | 'gras' | 'italique' | 'liste' | 'numeros'

export const GESTES: readonly { id: Geste; libelle: string; aide: string }[] = [
  { id: 'titre', libelle: 'Titre', aide: 'Fait de la ligne un intertitre' },
  { id: 'gras', libelle: 'Gras', aide: 'Met la sélection en gras' },
  { id: 'italique', libelle: 'Italique', aide: 'Met la sélection en italique' },
  { id: 'liste', libelle: 'Liste', aide: 'Fait des lignes une liste à puces' },
  { id: 'numeros', libelle: 'Liste numérotée', aide: 'Fait des lignes une liste numérotée' },
]

/** Entoure la sélection (ou un mot d'exemple, alors sélectionné) ; entourée deux fois, la marque se retire. */
function entourer(s: Saisie, marque: string, exemple: string): Saisie {
  const avant = s.texte.slice(0, s.debut)
  const choisi = s.texte.slice(s.debut, s.fin)
  const apres = s.texte.slice(s.fin)
  if (choisi && avant.endsWith(marque) && apres.startsWith(marque)) {
    return { texte: avant.slice(0, -marque.length) + choisi + apres.slice(marque.length), debut: s.debut - marque.length, fin: s.fin - marque.length }
  }
  const coeur = choisi || exemple
  return { texte: `${avant}${marque}${coeur}${marque}${apres}`, debut: s.debut + marque.length, fin: s.debut + marque.length + coeur.length }
}

const PREFIXE = /^(?:#{1,6} |[-*] |\d+\. )/

/** Pose un préfixe sur chaque ligne touchée par la sélection ; le même préfixe déjà là se retire (le geste se défait). */
function prefixer(s: Saisie, prefixe: (i: number) => string): Saisie {
  const debutLigne = s.texte.lastIndexOf('\n', s.debut - 1) + 1
  const finBrute = s.texte.indexOf('\n', s.fin)
  const finLigne = finBrute === -1 ? s.texte.length : finBrute
  const lignes = s.texte.slice(debutLigne, finLigne).split('\n')
  // Les titres de partie et de section (« # … », « ## … ») découpent le mémoire : la barre d'outils ne les touche jamais.
  const intouchable = (l: string) => !l.trim() || /^#{1,2} /.test(l)
  let k = 0
  const dejaLa = lignes.every((l) => { if (intouchable(l)) return true; const la = l.startsWith(prefixe(k)); k += 1; return la })
  let n = 0
  const nouvelles = lignes.map((l) => {
    if (intouchable(l)) return l
    const nu = l.replace(PREFIXE, '')
    const ligne = dejaLa ? nu : `${prefixe(n)}${nu}`
    n += 1
    return ligne
  })
  const bloc = nouvelles.join('\n')
  return { texte: s.texte.slice(0, debutLigne) + bloc + s.texte.slice(finLigne), debut: debutLigne, fin: debutLigne + bloc.length }
}

/** Applique un geste de la barre d'outils. */
export function appliquerGeste(geste: Geste, s: Saisie): Saisie {
  switch (geste) {
    case 'gras': return entourer(s, '**', 'texte en gras')
    case 'italique': return entourer(s, '*', 'texte en italique')
    case 'titre': return prefixer(s, () => '### ')
    case 'liste': return prefixer(s, () => '- ')
    case 'numeros': return prefixer(s, (i) => `${i + 1}. `)
  }
}

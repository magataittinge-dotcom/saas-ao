// Recherche de la palette Ctrl K (components/layout/CommandPalette.tsx), à la place de la recherche par défaut de cmdk.
// La recherche par défaut retenait une valeur dès que les lettres tapées y figuraient dans l'ordre, même éparpillées :
// l'identifiant d'un AO (lettres a à f) et l'adresse de l'acheteur faisaient passer un AO devant « Coffre-fort » ou
// « Nouvel AO » (recette finale). Ici, chaque mot tapé doit se trouver dans un mot de la valeur : en entier, au début
// d'un mot, ou à défaut au milieu ; sans accents ni capitales ; l'identifiant n'est jamais cherché.

const IDENTIFIANT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const normaliser = (texte: string): string =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const mots = (texte: string): string[] => normaliser(texte).split(/[^a-z0-9]+/).filter(Boolean)

/** Score de 0 (écartée) à 1 (chaque mot tapé est un mot de la valeur), au format du `filter` de cmdk. */
export function scorePalette(valeur: string, recherche: string, motsCles: readonly string[] = []): number {
  const termes = mots(recherche)
  if (termes.length === 0) return 1
  const disponibles = mots([valeur, ...motsCles].join(' ').replace(IDENTIFIANT, ' '))
  let total = 0
  for (const terme of termes) {
    if (disponibles.includes(terme)) total += 3
    else if (disponibles.some((m) => m.startsWith(terme))) total += 2
    else if (disponibles.some((m) => m.includes(terme))) total += 1
    else return 0
  }
  return total / (3 * termes.length)
}

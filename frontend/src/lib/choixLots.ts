// Choix du lot à analyser. Un AO à plusieurs lots n'a aucun choix par défaut : lancer
// l'ensemble coûte une analyse par lot, c'est une décision explicite du patron.
// Un AO à lot unique (ou sans lot) garde « l'ensemble du dossier » par défaut.

export const TOUS = 'all'

export function choixParDefaut(lotRetenu: string | null | undefined, nbLots: number): Set<string> {
  if (lotRetenu) return new Set([lotRetenu])
  return nbLots >= 2 ? new Set() : new Set([TOUS])
}

/** Cliquer une carte : « tous les lots » est exclusif ; retirer le dernier lot ne laisse rien de choisi (plusieurs lots). */
export function basculerLot(choix: ReadonlySet<string>, lotId: string, nbLots: number): Set<string> {
  if (lotId === TOUS) return new Set([TOUS])
  const suivant = new Set(choix)
  suivant.delete(TOUS)
  if (suivant.has(lotId)) suivant.delete(lotId)
  else suivant.add(lotId)
  if (suivant.size === 0 && nbLots < 2) return new Set([TOUS])
  return suivant
}

export function peutLancer(choix: ReadonlySet<string>): boolean {
  return choix.size > 0
}

/** Un seul lot coché, déjà analysé : il se rouvre (il devient le lot en cours) sans être relu, donc sans unité. Plusieurs lots
 *  cochés, tout le dossier ou un lot jamais lu : c'est une vraie analyse, 1 unité par lot (null). */
export function lotAOuvrir(choix: ReadonlySet<string>, lotsAnalyses: readonly string[] | undefined): string | null {
  if (choix.size !== 1 || choix.has(TOUS)) return null
  const [lot] = choix
  return lotsAnalyses?.includes(lot) ? lot : null
}

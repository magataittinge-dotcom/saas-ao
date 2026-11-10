// Le motif de requête du système (INVENTAIRE, constat n° 1 : une erreur du serveur s'affichait comme « vous n'avez rien »).
// Un écran qui lit des données passe TOUJOURS par ces quatre phases, dans cet ordre :
//   chargement → erreur → vide → contenu.
// L'erreur passe avant le vide : sans réponse, on ne sait pas s'il n'y a rien. Composant : components/ui/etats.tsx (<EtatRequete>).

export type PhaseRequete = 'chargement' | 'erreur' | 'vide' | 'contenu'

/** Ce qu'on lit d'une requête (forme de @tanstack/react-query, sans en dépendre). */
export interface RequeteLue<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
}

/** Une liste vide, un objet nul ou indéfini : rien à montrer. */
export const estVideParDefaut = (donnees: unknown): boolean =>
  donnees == null || (Array.isArray(donnees) && donnees.length === 0)

/**
 * La phase d'une requête. Des données déjà là l'emportent sur une erreur de rafraîchissement (on garde ce qu'on a, l'écran
 * dit seulement que la mise à jour a échoué) ; sans données, l'erreur l'emporte toujours sur le vide.
 */
export function phaseRequete<T>(r: RequeteLue<T>, estVide: (donnees: T) => boolean = estVideParDefaut): PhaseRequete {
  if (r.data === undefined) {
    if (r.isError) return 'erreur'
    return 'chargement'
  }
  if (r.isLoading && estVide(r.data)) return 'chargement'
  return estVide(r.data) ? 'vide' : 'contenu'
}

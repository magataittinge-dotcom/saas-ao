// « Actualiser » sur l'écran des pièces : la liste est recalculée depuis les exigences analysées (sans IA). Le retour dit
// ce qui s'est passé, pour qu'un clic ne reste jamais sans réponse (R18).

export type EtatActualisation =
  | { etat: 'en_cours' }
  | { etat: 'fait'; avant: number; apres: number }
  | { etat: 'echec' }

const pieces = (n: number) => `${n} ${n > 1 ? 'pièces' : 'pièce'}`

export function messageActualisation(e: EtatActualisation | null): string {
  if (!e) return ''
  if (e.etat === 'en_cours') return 'Actualisation…'
  if (e.etat === 'echec') return 'L’actualisation n’a pas abouti. Réessayez dans un instant.'
  return e.avant === e.apres
    ? `Liste à jour : ${pieces(e.apres)}, rien n’a changé`
    : `Liste actualisée : ${pieces(e.apres)} au lieu de ${e.avant}`
}

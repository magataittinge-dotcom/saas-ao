// Mon entreprise — un compte dont le profil est vide ne voit qu'une première action : « Commencer par votre SIRET ».
// Fonction pure, sans appel : elle ne lit que les données déjà chargées.
import { INFORMATIONS, type DonneesEntreprise } from './avancement'

/**
 * Le profil est vide quand le SIRET n'est pas validé ET qu'aucune des informations suivies n'est renseignée
 * (raison sociale, SIRET, adresse, dirigeant, activités, équipe, matériel, pièces du coffre, références…).
 * Dès que le SIRET est validé, ou qu'une seule information est saisie, la page complète revient.
 * Une liste pas encore chargée compte pour vide : la page ne s'ouvre en « vide » qu'une fois le profil lu (voir Company).
 */
export function entrepriseVide(d: DonneesEntreprise): boolean {
  if (d.organisation?.siret_verified) return false
  return !INFORMATIONS.some((information) => information.rempli(d))
}

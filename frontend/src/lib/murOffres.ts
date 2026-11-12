/**
 * Le geste de chaque offre au mur d'abonnement (rapport E2E-2, bug 3). Le serveur refuse une seconde souscription (409) à une
 * organisation qui paie déjà : son offre est marquée « Votre offre », sans bouton, et changer d'offre passe par le portail de
 * paiement, comme dans Paramètres > Abonnement. Sans offre payante (essai) : la page de paiement, comme avant.
 */
import { trouverOffre } from '@/lib/offres'

export type GesteOffre = 'paiement' | 'actuelle' | 'portail'

export function gesteOffre(planOrganisation: string | null | undefined, offreId: string): GesteOffre {
  if (!trouverOffre(planOrganisation)) return 'paiement'
  return planOrganisation === offreId ? 'actuelle' : 'portail'
}

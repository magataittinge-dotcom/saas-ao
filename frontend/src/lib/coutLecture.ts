/**
 * Le coût de la lecture d'un dossier, dit sur le bouton et dans la confirmation (G1, recette du 4/11).
 * Règle du produit : 1 lot lu = 1 unité de l'abonnement. En offre illimitée, aucune unité n'est annoncée.
 */
import { libelleUnites } from '@/lib/lotsMetiers'

/** Au-delà d'un lot, la lecture se confirme avant l'appel : c'est plusieurs unités d'un coup. */
export const doitConfirmerLecture = (nbLots: number): boolean => nbLots > 1

const pluriel = (n: number) => (n > 1 ? 'lots' : 'lot')

/** « Lire 1 lot (1 unité) », « Lire 13 lots (13 unités) » ; offre illimitée : « Lire 13 lots ». `nbLots` 0 = dossier sans lots. */
export function libelleBoutonLire(nbLots: number, illimite: boolean): string {
  const base = nbLots <= 0 ? 'Lire ce dossier' : `Lire ${nbLots} ${pluriel(nbLots)}`
  return illimite ? base : `${base} (${libelleUnites(Math.max(nbLots, 1))})`
}

/** Le titre de la confirmation : « Lire 13 lots = 13 unités » ; offre illimitée : « Lire 13 lots ». */
export function titreConfirmationLecture(nbLots: number, illimite: boolean): string {
  return illimite ? `Lire ${nbLots} ${pluriel(nbLots)}` : `Lire ${nbLots} ${pluriel(nbLots)} = ${libelleUnites(nbLots)}`
}

/** Sous le titre de la confirmation. */
export function detailConfirmationLecture(illimite: boolean): string {
  return illimite
    ? 'Votre offre est illimitée. La lecture démarre dès votre confirmation.'
    : 'Chaque lot lu décompte 1 unité de votre abonnement. La lecture démarre dès votre confirmation.'
}

/** La phrase de coût de l'en-tête de l'écran Lots. */
export function phraseCoutLots(nbLotsDetectes: number, illimite: boolean): string {
  if (nbLotsDetectes > 1) {
    return `Choisissez le ou les lots sur lesquels votre entreprise répond : Synorix ne lit que ceux-là.${illimite ? ' Votre offre est illimitée.' : ' Chaque lot lu décompte 1 unité de votre abonnement.'}`
  }
  if (nbLotsDetectes === 1) {
    return `Un seul lot a été détecté. Confirmez-le ou ajoutez des lots à la main.${illimite ? ' Votre offre est illimitée.' : ' La lecture décompte 1 unité de votre abonnement.'}`
  }
  return `Cet appel d’offres semble être mono-lot : lancez la lecture du dossier, ou ajoutez les lots à la main.${illimite ? ' Votre offre est illimitée.' : ' Chaque lot lu décompte 1 unité.'}`
}

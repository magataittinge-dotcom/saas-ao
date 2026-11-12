/**
 * Le coût de la lecture d'un dossier, dit sur le bouton et dans la confirmation (G1, recette du 4/11).
 * Règle du produit : 1 lot lu = 1 unité de l'abonnement. En offre illimitée, aucune unité n'est annoncée.
 */
import { libelleUnites } from '@/lib/lotsMetiers'

/** Au-delà d'un lot, la lecture se confirme avant l'appel : c'est plusieurs unités d'un coup. */
export const doitConfirmerLecture = (nbLots: number): boolean => nbLots > 1

const pluriel = (n: number) => (n > 1 ? 'lots' : 'lot')

/** « Analyser 1 lot (1 unité) », « Analyser 13 lots (13 unités) » ; offre illimitée : « Analyser 13 lots ». `nbLots` 0 = dossier sans lots. */
export function libelleBoutonLire(nbLots: number, illimite: boolean): string {
  const base = nbLots <= 0 ? 'Analyser le dossier' : `Analyser ${nbLots} ${pluriel(nbLots)}`
  return illimite ? base : `${base} (${libelleUnites(Math.max(nbLots, 1))})`
}

/** Le titre de la confirmation : « Analyser 13 lots = 13 unités » ; offre illimitée : « Analyser 13 lots ». */
export function titreConfirmationLecture(nbLots: number, illimite: boolean): string {
  return illimite ? `Analyser ${nbLots} ${pluriel(nbLots)}` : `Analyser ${nbLots} ${pluriel(nbLots)} = ${libelleUnites(nbLots)}`
}

/** Sous le titre de la confirmation. */
export function detailConfirmationLecture(illimite: boolean): string {
  return illimite
    ? 'Votre offre est illimitée. L’analyse démarre dès votre confirmation.'
    : 'Chaque lot analysé décompte 1 unité de votre abonnement. L’analyse démarre dès votre confirmation.'
}

/** La phrase de l'en-tête de l'écran Lots : la consigne, puis le coût en unités. En offre illimitée, rien sur l'abonnement
 *  (jury, tour 1 : « Votre offre est illimitée » est hors sujet ici ; la confirmation le dit au moment de lancer). */
export function phraseCoutLots(nbLotsDetectes: number, illimite: boolean): string {
  if (nbLotsDetectes > 1) {
    return `Choisissez le ou les lots sur lesquels votre entreprise répond : Synorix n’analyse que ceux-là.${illimite ? '' : ' Chaque lot analysé décompte 1 unité de votre abonnement.'}`
  }
  if (nbLotsDetectes === 1) {
    return `Un seul lot a été détecté. Confirmez-le ou ajoutez des lots à la main.${illimite ? '' : ' L’analyse décompte 1 unité de votre abonnement.'}`
  }
  return `Cet appel d’offres semble être mono-lot : lancez l’analyse du dossier, ou ajoutez les lots à la main.${illimite ? '' : ' Chaque lot analysé décompte 1 unité.'}`
}

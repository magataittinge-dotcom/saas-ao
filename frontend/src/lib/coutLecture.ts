/**
 * Le coût de la lecture d'un dossier, dit sur le bouton et dans la confirmation (G1, recette du 4/11).
 * Règle du produit : 1 lot lu = 1 unité de l'abonnement, pour toutes les offres (aucune n'est illimitée depuis le 11/11/2026).
 */
import { libelleUnites } from '@/lib/lotsMetiers'

/** Au-delà d'un lot, la lecture se confirme avant l'appel : c'est plusieurs unités d'un coup. */
export const doitConfirmerLecture = (nbLots: number): boolean => nbLots > 1

const pluriel = (n: number) => (n > 1 ? 'lots' : 'lot')

/** « Analyser 1 lot (1 unité) », « Analyser 13 lots (13 unités) ». `nbLots` 0 = dossier sans lots ; un dossier à plusieurs lots
 *  (`nbLotsDetectes`) sans lot coché : aucun coût dit, le bouton est grisé (« le dossier (1 unité) » était faux : rapport E2E-2). */
export function libelleBoutonLire(nbLots: number, nbLotsDetectes = 0): string {
  if (nbLots <= 0 && nbLotsDetectes > 1) return 'Analyser les lots choisis'
  const base = nbLots <= 0 ? 'Analyser le dossier' : `Analyser ${nbLots} ${pluriel(nbLots)}`
  return `${base} (${libelleUnites(Math.max(nbLots, 1))})`
}

/** Le titre de la confirmation : « Analyser 13 lots = 13 unités ». */
export function titreConfirmationLecture(nbLots: number): string {
  return `Analyser ${nbLots} ${pluriel(nbLots)} = ${libelleUnites(nbLots)}`
}

/** Sous le titre de la confirmation. */
export function detailConfirmationLecture(): string {
  return 'Chaque lot analysé décompte 1 unité de votre abonnement. L’analyse démarre dès votre confirmation.'
}

/** La phrase de l'en-tête de l'écran Lots : la consigne, puis le coût en unités. */
export function phraseCoutLots(nbLotsDetectes: number): string {
  if (nbLotsDetectes > 1) {
    return `Choisissez le ou les lots sur lesquels votre entreprise répond : Synorix n’analyse que ceux-là. Chaque lot analysé décompte 1 unité de votre abonnement.`
  }
  if (nbLotsDetectes === 1) {
    return `Un seul lot a été détecté. Confirmez-le ou ajoutez des lots à la main. L’analyse décompte 1 unité de votre abonnement.`
  }
  return `Cet appel d’offres semble être mono-lot : lancez l’analyse du dossier, ou ajoutez les lots à la main. Chaque lot analysé décompte 1 unité.`
}

// Visage du Compagnon — décisions pures : cadence, repli, boucle d'images.
// Rien ici ne touche au DOM : tout se teste sous Node.

/** Plafond d'images par seconde, partout (ordinateur comme téléphone). */
export const IMAGES_PAR_SECONDE_MAX = 30

/** Marge (ms) qui absorbe le tremblement des horloges d'écran sans dépasser le plafond sur la durée. */
const TOLERANCE_MS = 2

/**
 * Fabrique un régulateur de cadence : appelé à chaque rafraîchissement d'écran (requestAnimationFrame),
 * il répond « oui » seulement quand une image doit être calculée. Le rythme moyen ne dépasse jamais `ips`
 * (le prochain créneau avance toujours d'un intervalle plein), quelle que soit la fréquence de l'écran.
 */
export function faireRegulateur(ips: number = IMAGES_PAR_SECONDE_MAX): (maintenant: number) => boolean {
  const plafond = Math.max(1, Math.min(ips, IMAGES_PAR_SECONDE_MAX))
  const intervalle = 1000 / plafond
  let prochaine = -Infinity
  return (maintenant: number) => {
    if (maintenant < prochaine - TOLERANCE_MS) return false
    // En retard de plus d'un intervalle (premier appel, onglet revenu d'une pause) : on repart de maintenant.
    // Sinon on reste sur la grille régulière, ce qui borne le rythme moyen.
    prochaine = maintenant - prochaine > intervalle ? maintenant + intervalle : prochaine + intervalle
    return true
  }
}

export type RaisonRepli =
  | 'mouvement-reduit'
  | 'pas-de-webgl'
  | 'rendu-logiciel'
  | 'contexte-perdu'
  | 'points-illisibles'
  | 'serveur'

export interface ContexteRepli {
  /** prefers-reduced-motion: reduce */
  mouvementReduit: boolean
  /** Pas de rendu côté navigateur (génération HTML statique, tests). */
  serveur?: boolean
  /** WebGL indisponible ou création du contexte refusée. */
  webglIndisponible?: boolean
  /** WebGL rendu par le processeur (SwiftShader, llvmpipe…) : on garde l'image. */
  renduLogiciel?: boolean
  /** Le contexte a été perdu en cours de route. */
  contextePerdu?: boolean
  /** Le fichier de points n'a pas pu être chargé ou lu. */
  pointsIllisibles?: boolean
}

/** Pourquoi on montre le poster plutôt que le visage animé ; `null` = le visage peut tourner. */
export function raisonDuRepli(c: ContexteRepli): RaisonRepli | null {
  if (c.serveur) return 'serveur'
  if (c.mouvementReduit) return 'mouvement-reduit'
  if (c.webglIndisponible) return 'pas-de-webgl'
  if (c.renduLogiciel) return 'rendu-logiciel'
  if (c.contextePerdu) return 'contexte-perdu'
  if (c.pointsIllisibles) return 'points-illisibles'
  return null
}

/**
 * Faut-il même télécharger le module du visage ? Non en mouvement réduit (le poster suffit :
 * 0 octet de script, 0 image calculée) ni côté serveur.
 */
export function doitCharger(c: Pick<ContexteRepli, 'mouvementReduit' | 'serveur'>): boolean {
  return !c.mouvementReduit && !c.serveur
}

/** La boucle d'images ne tourne que si le visage est à l'écran, l'onglet visible et le mouvement permis. */
export function boucleDoitTourner(e: { mouvementReduit: boolean; aLEcran: boolean; ongletVisible: boolean }): boolean {
  return !e.mouvementReduit && e.aLEcran && e.ongletVisible
}

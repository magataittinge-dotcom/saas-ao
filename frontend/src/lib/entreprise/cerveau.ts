// Mon entreprise — le cerveau lumineux : les décisions de la page (cadence, montage des effets, boucle), pures.
// L'image (WebP) est fournie ; un canvas par-dessus ajoute des effets (étincelles, éclairs, lueur, balayage,
// parallaxe) dont les calculs sont dans cerveauEffets.ts, chargé à la demande avec le moteur.

/** Cadence visée : 60 images/s sur ordinateur, 30 au téléphone (écran tactile). */
export const IMAGES_ORDINATEUR = 60
export const IMAGES_TACTILE = 30

export const imagesParSeconde = (tactile: boolean): number => (tactile ? IMAGES_TACTILE : IMAGES_ORDINATEUR)

export interface EtatCarte {
  /** prefers-reduced-motion: reduce */
  mouvementReduit: boolean
  /** La carte est dans la zone visible de la fenêtre. */
  aLEcran: boolean
  /** L'onglet du navigateur est visible. */
  ongletVisible: boolean
}

/** Faut-il même télécharger le module des effets ? Non en mouvement réduit (l'image seule suffit : 0 octet de script). */
export function doitMonterEffets(e: Pick<EtatCarte, 'mouvementReduit' | 'aLEcran'> & { serveur?: boolean }): boolean {
  return !e.serveur && !e.mouvementReduit && e.aLEcran
}

/** La boucle d'images ne tourne que si la carte est à l'écran, l'onglet visible et le mouvement permis : 0 image hors écran. */
export function boucleDoitTourner(e: EtatCarte): boolean {
  return !e.mouvementReduit && e.aLEcran && e.ongletVisible
}

// ─── Géométrie : l'image est posée en « cover », les effets doivent suivre ───

/** Dimensions de l'image d'origine (rapport commun aux deux WebP). */
export const IMAGE = { largeur: 2752, hauteur: 1536 } as const
/** Position de l'image dans la carte (object-position) : le cerveau reste cadré quand la carte est plus large que haute. */
export const POSITION_IMAGE = { x: 0.5, y: 0.4 } as const

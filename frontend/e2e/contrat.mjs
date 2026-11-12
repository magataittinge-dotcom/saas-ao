// Le contrat de mots du parcours : les seuls libellés écrits en dur dans le test, chacun UNE fois.
// Sources : frontend/src/components/project/StepProgress.tsx (STEPS), frontend/src/lib/intelligence/action.ts (actionEtape),
// frontend/src/lib/etatAO.ts (FERMES, vocabulaire A5), et les écrans d'étape (routes/project/Step*.tsx).
// Un mot qui change à l'écran sans changer ici fait échouer le test : c'est voulu.

/** Le fil des étapes : nom accessible de chaque rond (StepProgress.STEPS), dans l'ordre. */
export const FIL = ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export']
export const NOM_FIL = 'Étapes de l’appel d’offres'

/** Le titre (h1) de chaque écran. */
export const TITRES = {
  nouveau: 'Nouvel appel d’offres',
  depot: 'Dépôt du dossier',
  lots: 'Lots',
  decider: 'Décider',
  pieces: 'Réunir les pièces',
  plan: 'Plan du mémoire',
  validerPlan: 'Valider le plan',
  rediger: 'Rédiger le mémoire',
  export: 'Export du dossier',
  accueil: null,
  mesAO: null,
}

/** Les verbes des étapes (action.ts / etatAO.ts / écrans). */
export const VERBES = {
  zoneDepot: 'DCE, dossier de l’acheteur',
  analyser: 'Analyser le dossier',
  analyserLot: 'Analyser 1 lot',
  yAller: 'On y va',
  passerPieces: 'Passer aux pièces',
  reunir: 'Réunir les pièces',
  deposerFormulaire: 'Déposer le formulaire',
  validerPlan: 'Valider le plan',
  rediger: 'Rédiger le mémoire',
  passerExport: 'Passer à l’export',
  modifierTexte: 'Modifier le texte',
  sommaire: 'Sommaire',
  editeur: 'Modifier le mémoire',
  enregistre: 'Enregistré à',
  telecharger: 'Télécharger le dossier',
  depose: 'Je l’ai déposé',
  memoireWord: 'Mémoire en Word',
  dialogueStatut: 'Mettre à jour le statut',
  enregistrer: 'Enregistrer',
  relancer: 'Relancer l’analyse',
}

/** Le mot de l'état « déposé » (etatAO.ts, FERMES.soumis). */
export const DEPOSE = 'Déposé'

/** Le bouton de suite d'un écran : « Étape suivante : Lots » à l'ordinateur, « Suivant : Lots » dans la barre du bas au téléphone. */
export const SUITE = { ordinateur: 'Étape suivante : ', telephone: 'Suivant : ' }

/** La partie du mémoire que le parcours ouvre depuis le sommaire (plan type, partie A). */
export const PARTIE_OUVERTE = '1. Implantation géographique'

/** Les deux champs demandés avant la rédaction (FormulaireMemoire). */
export const CHAMPS_MEMOIRE = { ouvriers: 'Nombre d’ouvriers dédiés', delai: 'Délai estimé' }

/** La pièce jointe par le parcours (formulaire de l'acheteur, sans signature demandée). */
export const PIECE_JOINTE = 'Déclaration du candidat (DC2)'

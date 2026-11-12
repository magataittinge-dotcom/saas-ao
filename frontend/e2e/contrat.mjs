// Le contrat de mots du parcours : les seuls libellés écrits en dur dans le test, chacun UNE fois.
// Sources : frontend/src/components/project/StepProgress.tsx (STEPS), frontend/src/lib/intelligence/action.ts (actionEtape),
// frontend/src/lib/etatAO.ts (FERMES, vocabulaire A5), et les écrans d'étape (routes/project/Step*.tsx).
// Un mot qui change à l'écran sans changer ici fait échouer le test : c'est voulu.

/** Le fil des étapes : nom accessible de chaque rond (StepProgress.STEPS), dans l'ordre. */
export const FIL = ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export']
export const NOM_FIL = 'Étapes de l’appel d’offres'

/** Les verbes des étapes (action.ts / etatAO.ts / écrans). */
export const VERBES = {
  zoneDepot: 'DCE, dossier de l’acheteur',
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
  relancer: 'Relancer',
}

/** Le titre (h1) de chaque écran. */
export const TITRES = {
  nouveau: 'Nouvel appel d’offres',
  depot: FIL[0],
  lots: FIL[1],
  decider: FIL[2],
  pieces: VERBES.reunir,
  plan: 'Plan du mémoire',
  rediger: VERBES.rediger,
  export: 'Export du dossier',
}

/** Le titre du message d'un AO déposé (routes/Project.tsx). */
export const DEPOSE = 'Le dossier est déposé'

/** Le bouton de suite d'un écran : « Étape suivante : Lots » à l'ordinateur, « Suivant : Lots » dans la barre du bas au téléphone. */
export const SUITE = { ordinateur: 'Étape suivante : ', telephone: 'Suivant : ' }

/** La partie du mémoire que le parcours ouvre depuis le sommaire (plan type, partie A). */
export const PARTIE_OUVERTE = '1. Implantation géographique'

/** Les deux champs demandés avant la rédaction (FormulaireMemoire). */
export const CHAMPS_MEMOIRE = { ouvriers: 'Nombre d’ouvriers dédiés', delai: 'Délai estimé' }

/** La pièce jointe par le parcours (formulaire de l'acheteur, sans signature demandée). */
export const PIECE_JOINTE = 'Déclaration du candidat (DC2)'

// ── Le second parcours (e2e/parcours-2.mjs) : les mots en plus, chacun UNE fois ─────────────────────────────────────────
// Sources : components/project/VaultPickerModal.tsx, PointsAEclaircir.tsx, FormulaireMemoire.tsx, LectureLots.tsx,
// routes/project/StepExport.tsx, components/common/SubscriptionWall.tsx, MettreAJourStatut.tsx + lib/etatAO.ts (CHOIX, D16),
// routes/Dashboard.tsx (bilan), components/parametres/SuppressionCompte.tsx + lib/suppressionCompte.ts.
export const PARCOURS_2 = {
  choisirPiece: 'Choisir',
  remplacerPiece: 'Remplacer',
  dialogueCoffre: 'Choisir une pièce du coffre-fort',
  pieceDuCoffre: 'Décennale',
  preparerQuestions: 'Préparer les questions',
  sourcePoint: 'Source : ',
  relancerRedaction: 'Relancer la rédaction',
  rienDecompte: 'Rien n’a été décompté',
  analyserLots: 'Analyser 2 lots',
  confirmerLots: 'Analyser les 2 lots',
  ouvrirLot: 'Ouvrir ce lot',
  tableauAcheteur: 'Télécharger le tableau de l’acheteur',
  murAbonnement: 'Passez au niveau supérieur',
  votreOffre: 'Votre offre',
  passerA: 'Passer à ',
  statut: 'Indiquer le résultat',
  gagne: 'Gagné',
  corrigerPerdu: 'Corriger : Perdu',
  rechercheMesAO: 'Chercher et filtrer mes appels d’offres',
  menuAO: 'Autres actions pour « ',
  afficherTermines: 'Afficher',
  bilan: 'Taux de réussite',
  supprimerCompte: 'Supprimer mon compte',
  dialogueSuppression: 'Supprimer votre compte ?',
  suppressionImmediate: 'sont supprimés tout de suite',
  confirmerSuppression: 'Supprimer définitivement',
  annuler: 'Annuler',
}

/** Les titres (h1) des écrans en plus. */
export const TITRES_2 = { accueil: 'Bonjour', parametres: 'Paramètres' }

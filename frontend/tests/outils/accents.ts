// Formes françaises écrites sans accent, à refuser dans les textes affichés (tranche « accents »).
// Liste volontairement limitée aux mots dont la forme sans accent n'existe pas en français
// (ou, pour « a », seulement devant un infinitif de statut : « a completer »).
// \b de JavaScript ne connaît pas les lettres accentuées : les bornes sont des classes Unicode.
const mot = (corps: string) => new RegExp(`(?<![\\p{L}])(?:${corps})(?![\\p{L}])`, 'iu')

export const FORMES_SANS_ACCENT: RegExp[] = [
  mot('verifi\\p{L}*'),
  mot('interess\\p{L}*'),
  mot('detect\\p{L}*'),
  mot('gener(e|er|ee|es|ees|ation|ations|alement)'),
  mot('referenc\\p{L}*'),
  mot('etapes?'),
  mot('deja'),
  mot('cre(e|ee|es|ees|er)'),
  mot('telecharg\\p{L}*'),
  mot('memoires?'),
  mot('pieces?'),
  mot('precedent\\p{L}*'),
  mot('selection\\p{L}*'),
  mot('resultats?'),
  mot('numeros?'),
  mot('debut'),
  mot('periode'),
  mot('probleme\\p{L}*'),
  mot('necessaire\\p{L}*'),
  mot('parametres?'),
  mot('echec'),
  mot('echeances?'),
  mot('ecran\\p{L}*'),
  mot('reponse\\p{L}*'),
  mot('equipes?'),
  mot('societe\\p{L}*'),
  mot('telephone'),
  mot('dernieres?'),
  mot('premieres?'),
  mot('apres'),
  mot('tres'),
  mot('ete'),
  mot('regles?'),
  mot('systeme\\p{L}*'),
  mot('donnees?'),
  mot('renseigne(e|es)?'),
  mot('completer'),
  // « a » seul devant un infinitif de statut : « a completer », « a joindre »
  /(?<![\p{L}\p{N}])a (completer|joindre|confirmer|renouveler|verifier|signer|remplir|saisir|renseigner|valider|relire|traiter|preciser|choisir|telecharger|corriger)(?![\p{L}])/iu,
]

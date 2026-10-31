// Lexique des sigles de la commande publique : UNE source pour tous les écrans (S3 de la simplification).
// Principe : on garde le sigle, parce qu'il est écrit sur les pièces de l'acheteur, et le composant
// <Sigle> le développe à sa première apparition sur chaque écran, avec une infobulle d'une ligne.
//
// Aucune définition sans source. Chaque entrée porte sa source (champ `source`, relu par sigles.test.ts)
// et, ci-dessous, le texte vérifié le 31/10/2026 :
//   • F32130 — service-public « Examiner les documents de la consultation d'un marché public »
//     (vérifiée le 01/04/2026) : DCE, RC, CCAP, CCTP, CCAG, documents financiers (BPU, DPGF), acte d'engagement.
//   • F32154 — service-public « Répondre au marché : préparer le dossier offre » (vérifiée le 21/08/2026) : BPU, DPGF.
//   • CCP R2132-1 — « Les documents de la consultation sont l'ensemble des documents fournis par l'acheteur ou
//     auxquels il se réfère afin de définir son besoin et de décrire les modalités de la procédure de passation. »
//     (R2132-2 ne traite que de leur mise à disposition gratuite, sur le profil d'acheteur dès 60 000 € HT.)
//   • F23784 + R17445 — acte d'engagement : modèle ATTRI1 facultatif, signature à l'attribution.
//   • R65918, R65921 — DC1 et DC2 : « Formulaire non obligatoire » ; l'acheteur indique dans le RC les
//     documents à remplir (F32130, rubrique « Règlement de la consultation »).
//   • CCP R2143-4 — DUME : « L'acheteur accepte que le candidat présente sa candidature sous la forme d'un
//     document unique de marché européen. »
//   • F32144 (B1, ligne 43) — DC4 : un DC4 par sous-traitant.
//   • Guide du prix dans les marchés publics (OECP, economie.gouv.fr/daj) — DQE : « détail quantitatif estimatif ».
// Les références B1 viennent de .claude/echange/nuit-25-10/notes/B1-textes-et-formulaires.md.

export const SIGLES = ['DCE', 'RC', 'CCAP', 'CCTP', 'CCAG', 'DPGF', 'BPU', 'DQE', 'AE', 'ATTRI1', 'DC1', 'DC2', 'DC4', 'DUME'] as const
export type CodeSigle = (typeof SIGLES)[number]

export interface EntreeLexique {
  sigle: CodeSigle
  /** Le groupe nominal qui remplace le sigle à sa première apparition (sans article : « le dossier de l'acheteur (DCE) »). */
  developpe: string
  /** L'explication d'une ligne, affichée dans l'infobulle. */
  explication: string
  /** Où la définition a été vérifiée (article du Code de la commande publique ou fiche service-public). */
  source: string
}

export const LEXIQUE: Record<CodeSigle, EntreeLexique> = {
  // F32130 ; CCP R2132-1
  DCE: {
    sigle: 'DCE',
    developpe: "dossier de l'acheteur",
    explication: "Toutes les pièces publiées par l'acheteur pour cet appel d'offres.",
    source: 'CCP R2132-1 ; service-public F32130',
  },
  // F32130, rubrique « Règlement de la consultation (RC) »
  RC: {
    sigle: 'RC',
    developpe: 'règlement de la consultation',
    explication: 'Le mode d’emploi pour répondre : pièces à remettre, date limite, critères de note.',
    source: 'service-public F32130',
  },
  // F32130, rubrique CCAP : délais d'exécution, avances, acomptes et garanties, délais de paiement et pénalités
  CCAP: {
    sigle: 'CCAP',
    developpe: 'clauses administratives',
    explication: 'Le contrat : délais, avances, paiements, pénalités et garanties.',
    source: 'service-public F32130',
  },
  // F32130, rubrique CCTP : spécifications techniques, normes à appliquer, plans
  CCTP: {
    sigle: 'CCTP',
    developpe: 'clauses techniques',
    explication: 'Ce qu’il faut réaliser, et comment : spécifications techniques, normes, plans.',
    source: 'service-public F32130',
  },
  // F32130 : CCAG « pas joints aux documents de la consultation » ; « s'applique uniquement si le marché le mentionne »
  CCAG: {
    sigle: 'CCAG',
    developpe: 'clauses administratives générales',
    explication: 'Le texte standard auquel le contrat peut renvoyer ; il n’est pas joint au dossier.',
    source: 'service-public F32130',
  },
  // F32130 et F32154 : « décomposant les éléments du prix forfaitaire […], avec les quantités et les éléments à chiffrer »
  DPGF: {
    sigle: 'DPGF',
    developpe: 'tableau des prix',
    explication: 'Le tableau où vous inscrivez vos prix, poste par poste, avec les quantités de l’acheteur.',
    source: 'service-public F32130 et F32154',
  },
  // F32130 : « Bordereau de prix unitaire (BPU) où chaque prestation est listée »
  BPU: {
    sigle: 'BPU',
    developpe: 'prix unitaires',
    explication: 'La liste des prestations, où vous inscrivez un prix pour chaque unité.',
    source: 'service-public F32130 et F32154',
  },
  // Guide du prix (OECP) : « détail quantitatif estimatif » d'un marché à prix unitaires
  DQE: {
    sigle: 'DQE',
    developpe: 'quantités estimées',
    explication: 'Les quantités estimées par l’acheteur, auxquelles s’appliquent les prix unitaires.',
    source: 'Guide du prix dans les marchés publics (OECP, economie.gouv.fr/daj)',
  },
  // F32130, rubrique « Acte d'engagement » ; F23784 (signature à l'attribution)
  AE: {
    sigle: 'AE',
    developpe: 'acte d’engagement',
    explication: 'La pièce par laquelle le candidat s’engage sur son prix ; elle se signe le plus souvent à l’attribution.',
    source: 'service-public F32130 et F23784',
  },
  // F32130 : « ATTRI1 - Acte d'engagement (ex-DC3) » ; R17445 : modèle facultatif
  ATTRI1: {
    sigle: 'ATTRI1',
    developpe: 'modèle d’acte d’engagement',
    explication: 'Le modèle facultatif de l’État pour l’acte d’engagement ; l’acheteur peut utiliser le sien.',
    source: 'service-public R17445 et F32130',
  },
  // R65918 : « Formulaire non obligatoire » ; F32130 : le RC indique les documents à remplir (DC1 et DC2 ou Dume)
  DC1: {
    sigle: 'DC1',
    developpe: 'lettre de candidature',
    explication: 'Un modèle facultatif ; l’acheteur indique dans le règlement s’il le demande.',
    source: 'service-public R65918 et F32130',
  },
  // R65921 : « Formulaire non obligatoire » ; F32130 idem
  DC2: {
    sigle: 'DC2',
    developpe: 'déclaration du candidat',
    explication: 'Un modèle facultatif ; l’acheteur indique dans le règlement s’il le demande.',
    source: 'service-public R65921 et F32130',
  },
  // F32144 (B1 n°43) : un DC4 par sous-traitant
  DC4: {
    sigle: 'DC4',
    developpe: 'déclaration de sous-traitance',
    explication: 'Un formulaire par sous-traitant.',
    source: 'service-public F32144',
  },
  // CCP R2143-4 ; F32130 (glossaire « Dume »)
  DUME: {
    sigle: 'DUME',
    developpe: 'document unique de marché européen',
    explication: 'Un formulaire européen de candidature, que l’acheteur accepte à la place de la candidature habituelle.',
    source: 'CCP R2143-4 ; service-public F32130',
  },
}

/** « tableau des prix (DPGF) » : la forme développée, pour les textes qui ne passent pas par <Sigle>
 *  (messages, étiquettes, attributs). Toujours développée : un message isolé n'a pas de « première apparition ». */
export function developper(code: CodeSigle): string {
  return `${LEXIQUE[code].developpe} (${code})`
}

/** Les mots du sigle, pour la lecture d'écran : « DCE, dossier de l'acheteur ». */
export function nomSigle(code: CodeSigle): string {
  return `${code}, ${LEXIQUE[code].developpe}`
}

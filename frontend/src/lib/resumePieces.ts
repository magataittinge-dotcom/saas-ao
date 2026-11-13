// Étape « Pièces » : UN SEUL calcul des comptes, partagé par le résumé, la barre du bas et la liste — prêtes + à joindre + à
// renouveler = les pièces demandées au dépôt. Les statuts viennent de lib/statutPiece.ts ; aucune règle nouvelle.
// Les pièces « si concerné », « facultatif », « pour l'attribution » et « non concerné » ne sont pas demandées maintenant :
// elles sortent du total (comme dans le score du serveur) et sont comptées à part.
import type { CarteResume } from '@/components/etape'
import { statutPiece, type EntreeStatutPiece, type StatutPiece } from '@/lib/statutPiece'

export interface ComptesPieces {
  pretes: number
  /** « À joindre » et « Date de validité à confirmer » : rien de prêt dans le dossier. */
  aJoindre: number
  aRenouveler: number
  /** B7 — formulaires déposés « À relire » : dans le dossier, à relire avant le dépôt ; jamais comptés « à joindre ». */
  aRelire: number
  /** Pièces demandées au dépôt = pretes + aJoindre + aRenouveler + aRelire. */
  total: number
  /** Facultatives, « si concerné » ou pour l'attribution : non demandées maintenant. */
  autres: number
}

export function comptesDetailles(pieces: readonly EntreeStatutPiece[], echeance: string | null): ComptesPieces {
  let pretes = 0
  let aJoindre = 0
  let aRenouveler = 0
  let aRelire = 0
  let autres = 0
  for (const p of pieces) {
    const code = statutPiece(p, echeance).code
    if (code === 'pret') pretes += 1
    else if (code === 'a-renouveler') aRenouveler += 1
    else if (code === 'a-relire') aRelire += 1
    else if (code === 'a-joindre' || code === 'a-confirmer') aJoindre += 1
    else if (code !== 'non-concerne') autres += 1
  }
  return { pretes, aJoindre, aRenouveler, aRelire, total: pretes + aJoindre + aRenouveler + aRelire, autres }
}

/** « 12 prêtes · 4 à joindre · 3 à renouveler » : les mots du résumé, repris par la barre du bas. */
export function phraseComptes(c: ComptesPieces): string {
  return `${c.pretes} ${c.pretes > 1 ? 'prêtes' : 'prête'} · ${c.aJoindre} à joindre · ${c.aRenouveler} à renouveler${c.aRelire > 0 ? ` · ${c.aRelire} à relire` : ''}`
}

/**
 * Les pièces hors du total (facultatives, « si concerné », pour l'attribution) : elles se nomment, elles ne se cachent pas.
 * « 1 facultative ou pour l’attribution » ; rien quand il n'y en a pas. Le total demandé au dépôt est le même qu'à l'Export.
 */
export function phrasePiecesAutres(c: Pick<ComptesPieces, 'autres'>): string | null {
  return c.autres > 0 ? `${c.autres} facultative${c.autres > 1 ? 's' : ''} ou pour l’attribution` : null
}

/** Le mot et l'état d'une pièce, pour EtatElement : « Prêt », « À renouveler… », « À joindre »… */
export function etatDeStatut(s: StatutPiece): { etat: 'pret' | 'a-verifier' | 'a-couvrir'; texte: string; perimee: boolean } {
  const perimee = s.classe.includes('--perimee')
  if (s.code === 'pret') return { etat: 'pret', texte: s.texte, perimee }
  if (s.code === 'a-joindre') return { etat: 'a-couvrir', texte: s.texte, perimee }
  return { etat: 'a-verifier', texte: s.texte, perimee }
}

export function cartesPieces(
  pieces: readonly EntreeStatutPiece[], echeance: string | null,
  groupes?: { coffre: readonly EntreeStatutPiece[]; formulaires: readonly EntreeStatutPiece[] },
): CarteResume[] {
  const c = comptesDetailles(pieces, echeance)
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
  const coffre = groupes ? comptesDetailles(groupes.coffre, echeance) : null
  const formulaires = groupes ? comptesDetailles(groupes.formulaires, echeance) : null
  return [
    {
      // « Prêtes : Aucune » (les pièces : au féminin), jamais « Aucun »
      libelle: 'Prêtes', valeur: String(c.pretes), rien: 'Aucune', etat: c.total > 0 && c.pretes === c.total ? 'pret' : 'neutre', jauge: { rempli: c.pretes, total: c.total },
      detail: `sur ${c.total} ${c.total > 1 ? 'pièces demandées' : 'pièce demandée'} au dépôt${phrasePiecesAutres(c) ? `, plus ${phrasePiecesAutres(c)}` : ''}`,
    },
    {
      libelle: 'À joindre', valeur: String(c.aJoindre), rien: 'Aucune', etat: c.aJoindre > 0 ? 'a-verifier' : 'pret',
      detail: coffre && formulaires ? `${pluriel(coffre.aJoindre, 'pièce')} du coffre-fort · ${pluriel(formulaires.aJoindre, 'formulaire')} à compléter` : undefined,
    },
    { libelle: 'À renouveler', valeur: String(c.aRenouveler), rien: 'Aucune', etat: c.aRenouveler > 0 ? 'a-verifier' : 'pret', detail: c.aRenouveler > 0 ? 'Valables moins longtemps que la date de remise.' : 'Aucune pièce ne périme avant la remise.' },
    // B7 : une case seulement quand un formulaire déposé est à relire (jamais « À relire : Aucune »)
    ...(c.aRelire > 0 ? [{
      libelle: 'À relire', valeur: String(c.aRelire), rien: 'Aucune' as const, etat: 'a-verifier' as const,
      detail: c.aRelire > 1 ? 'Ils partent dans le dossier : relisez-les avant le dépôt.' : 'Il part dans le dossier : relisez-le avant le dépôt.',
    }] : []),
  ]
}

/**
 * Les pièces de l'étape, dites en une phrase de faits (jury, tour 1 : trois cases dont deux « Aucune », une pastille « Prêt »
 * sur « À renouveler : Aucune », des zéros dans la barre du bas) : ce qui est prêt sur ce qui est demandé au dépôt, puis
 * seulement ce qui existe (à renouveler, facultatives). Jamais un zéro.
 */
export function phraseResumePieces(c: ComptesPieces): string {
  if (c.total === 0) return c.autres > 0 ? `Aucune pièce n’est demandée au dépôt ; ${phrasePiecesAutres(c)}.` : ''
  const demandees = `${c.total} ${c.total > 1 ? 'pièces demandées' : 'pièce demandée'} au dépôt`
  const tete = c.pretes === c.total ? `${demandees} : ${c.total > 1 ? 'toutes sont prêtes' : 'elle est prête'}`
    : c.pretes === 0 && !c.aRelire ? `${demandees}, à joindre`
    : c.pretes === 0 ? demandees
    : `${c.pretes} ${c.pretes > 1 ? 'pièces prêtes' : 'pièce prête'} sur ${demandees}`
  const suite = [
    c.aRenouveler > 0 ? `${c.aRenouveler} à renouveler avant la remise` : null,
    c.aRelire > 0 ? `${c.aRelire} à relire` : null,
    phrasePiecesAutres(c),
  ].filter(Boolean)
  return `${[tete, ...suite].join(' · ')}.`
}

/** Le bilan de la barre du bas : seulement ce qui se compte (« 3 prêtes · 11 à joindre »), jamais « 0 prête ». */
export function phraseComptesUtiles(c: ComptesPieces): string {
  return [
    c.pretes > 0 ? `${c.pretes} ${c.pretes > 1 ? 'prêtes' : 'prête'}` : null,
    c.aJoindre > 0 ? `${c.aJoindre} à joindre` : null,
    c.aRenouveler > 0 ? `${c.aRenouveler} à renouveler` : null,
    c.aRelire > 0 ? `${c.aRelire} à relire` : null,
  ].filter(Boolean).join(' · ')
}

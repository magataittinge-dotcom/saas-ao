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
  /** Pièces demandées au dépôt = pretes + aJoindre + aRenouveler. */
  total: number
  /** Facultatives, « si concerné » ou pour l'attribution : non demandées maintenant. */
  autres: number
}

export function comptesDetailles(pieces: readonly EntreeStatutPiece[], echeance: string | null): ComptesPieces {
  let pretes = 0
  let aJoindre = 0
  let aRenouveler = 0
  let autres = 0
  for (const p of pieces) {
    const code = statutPiece(p, echeance).code
    if (code === 'pret') pretes += 1
    else if (code === 'a-renouveler') aRenouveler += 1
    else if (code === 'a-joindre' || code === 'a-confirmer') aJoindre += 1
    else if (code !== 'non-concerne') autres += 1
  }
  return { pretes, aJoindre, aRenouveler, total: pretes + aJoindre + aRenouveler, autres }
}

/** « 12 prêtes · 4 à joindre · 3 à renouveler » : les mots du résumé, repris par la barre du bas. */
export function phraseComptes(c: ComptesPieces): string {
  return `${c.pretes} ${c.pretes > 1 ? 'prêtes' : 'prête'} · ${c.aJoindre} à joindre · ${c.aRenouveler} à renouveler`
}

/** Le mot et l'état d'une pièce, pour EtatElement : « Prêt », « À renouveler… », « À joindre »… */
export function etatDeStatut(s: StatutPiece): { etat: 'pret' | 'a-verifier' | 'a-couvrir'; texte: string } {
  if (s.code === 'pret') return { etat: 'pret', texte: s.texte }
  if (s.code === 'a-joindre') return { etat: 'a-couvrir', texte: s.texte }
  return { etat: 'a-verifier', texte: s.texte }
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
      libelle: 'Prêtes', valeur: String(c.pretes), etat: c.total > 0 && c.pretes === c.total ? 'pret' : 'neutre', jauge: { rempli: c.pretes, total: c.total },
      detail: `sur ${c.total} ${c.total > 1 ? 'pièces demandées' : 'pièce demandée'}${c.autres > 0 ? ` · ${c.autres} facultative${c.autres > 1 ? 's' : ''} ou pour l’attribution` : ''}`,
    },
    {
      libelle: 'À joindre', valeur: String(c.aJoindre), etat: c.aJoindre > 0 ? 'a-verifier' : 'pret',
      detail: coffre && formulaires ? `${pluriel(coffre.aJoindre, 'pièce')} du coffre-fort · ${pluriel(formulaires.aJoindre, 'formulaire')} à compléter` : undefined,
    },
    { libelle: 'À renouveler', valeur: String(c.aRenouveler), etat: c.aRenouveler > 0 ? 'a-verifier' : 'pret', detail: c.aRenouveler > 0 ? 'Valables moins longtemps que la date de remise.' : 'Aucune pièce ne périme avant la remise.' },
  ]
}

// Étape « Pièces » : les cartes du résumé (« 12 prêtes · 4 à joindre · 3 à renouveler »), tirées des statuts déjà calculés
// (lib/statutPiece.ts) — aucune règle nouvelle : le décompte de chaque statut, rien d'autre.
import type { CarteResume } from '@/components/etape'
import { libelleComptes, statutPiece, type EntreeStatutPiece } from '@/lib/statutPiece'

interface Comptes { aJoindre: number; pretes: number }

export function cartesPieces(
  pieces: readonly EntreeStatutPiece[], echeance: string | null,
  detail?: { coffre: Comptes; formulaires: Comptes },
): CarteResume[] {
  let pretes = 0
  let aJoindre = 0
  let aRenouveler = 0
  for (const p of pieces) {
    const code = statutPiece(p, echeance).code
    if (code === 'pret') pretes += 1
    else if (code === 'a-renouveler') aRenouveler += 1
    else if (code === 'a-joindre' || code === 'a-confirmer') aJoindre += 1
  }
  const total = pretes + aJoindre + aRenouveler
  return [
    {
      libelle: 'Prêtes', valeur: String(pretes), etat: total > 0 && pretes === total ? 'pret' : 'neutre', jauge: { rempli: pretes, total },
      detail: detail ? `Coffre-fort : ${libelleComptes(detail.coffre.aJoindre, detail.coffre.pretes)}` : undefined,
    },
    {
      libelle: 'À joindre', valeur: String(aJoindre), etat: aJoindre > 0 ? 'a-verifier' : 'pret',
      detail: detail ? `Formulaires de l’acheteur : ${libelleComptes(detail.formulaires.aJoindre, detail.formulaires.pretes, 'formulaire')}` : undefined,
    },
    { libelle: 'À renouveler', valeur: String(aRenouveler), etat: aRenouveler > 0 ? 'a-verifier' : 'pret', detail: aRenouveler > 0 ? 'Valables moins longtemps que la date de remise.' : 'Aucune pièce ne périme avant la remise.' },
  ]
}

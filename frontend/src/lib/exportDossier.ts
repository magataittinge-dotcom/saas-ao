// Export du dossier — décision de Mohamed du 25/10 (export « 0/N »).
// Plus jamais de fraction « 0/N » : on dit ce qui est vrai — N exigences
// relevées (chacune avec sa source si l'extrait a été retrouvé dans le DCE),
// et « dont M confirmées par vous » seulement si M > 0. Synorix ne pose jamais
// « confirmée » tout seul : seul le geste de l'utilisateur.

import { statutPiece, type EntreeStatutPiece, type StatutPiece } from '@/lib/statutPiece'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function resumeExigences(total: number, avecSource: number, confirmees: number): string {
  if (total === 0) return "Les exigences apparaissent après l'analyse du DCE"
  let texte = `${pluriel(total, 'exigence')} ${total > 1 ? 'relevées' : 'relevée'}`
  if (avecSource >= total) texte += total > 1 ? ', chacune avec sa source' : ', avec sa source'
  if (confirmees > 0) texte += `, dont ${confirmees} ${confirmees > 1 ? 'confirmées' : 'confirmée'} par vous`
  if (avecSource < total) texte += ` · ${total - avecSource} à vérifier dans le DCE`
  return texte
}

export function compteGroupe(total: number, confirmees: number): string {
  const n = pluriel(total, 'exigence')
  if (confirmees === 0) return n
  if (total === 1) return `${n}, confirmée par vous`
  return `${n}, dont ${confirmees} ${confirmees > 1 ? 'confirmées' : 'confirmée'} par vous`
}

// Groupes de confirmation → catégories réelles (backend services/exigences.py).
export const GROUPES_EXIGENCES = [
  { id: 'candidature', label: 'Candidature' },
  { id: 'offre_technique', label: 'Offre technique' },
  { id: 'execution', label: 'Exécution' },
] as const
export type GroupeExigences = (typeof GROUPES_EXIGENCES)[number]['id']

// Le score de conformité du serveur ne compte que les pièces dont l'entreprise
// est responsable (checklist_matcher._SCORED_GROUPS) : le gate fait de même.
const GROUPES_DU_SCORE = new Set(['fournir', 'completer'])
export function lignesDuScore<T extends { document_group?: string }>(lignes: T[]): T[] {
  return lignes.filter((l) => GROUPES_DU_SCORE.has(l.document_group ?? 'fournir'))
}

/** Pièces écartées et points signalés par le ZIP (en-tête X-Export-Warnings). */
export function lireAvertissementsExport(valeur: unknown): string[] {
  if (typeof valeur !== 'string' || !valeur) return []
  try {
    const liste: unknown = JSON.parse(valeur)
    return Array.isArray(liste) ? liste.filter((a): a is string => typeof a === 'string') : []
  } catch {
    return []
  }
}

// ── Pièces (décision du 25/10, point 3 ; statuts positifs au bloc 9) ─────────
// La règle des statuts vit dans lib/statutPiece.ts (fonction pure). « Prêt » est
// un FAIT calculé par le serveur (le fichier part dans le ZIP, valable et daté
// pour une pièce du coffre) : jamais déduit d'un statut seul.

export type EtatPieceEntree = EntreeStatutPiece

export function etatPiece(
  p: EtatPieceEntree, echeance?: string | null,
): { texte: string; ton: 'ok' | 'attention' | 'neutre'; statut: StatutPiece } {
  const statut = statutPiece(p, echeance)
  const ton = statut.code === 'pret' ? 'ok' : statut.action ? 'attention' : 'neutre'
  return { texte: statut.texte, ton, statut }
}

/** S6 — la ligne au-dessus de « Télécharger le dossier » : les pièces non conformes ne partent pas dans le ZIP. */
export function phrasePiecesAJoindre(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? '1 pièce est à joindre. Elle ne sera pas dans le dossier.'
    : `${n} pièces sont à joindre. Elles ne seront pas dans le dossier.`
}

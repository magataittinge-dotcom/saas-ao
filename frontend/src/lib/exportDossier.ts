// Export du dossier — décision de Mohamed du 25/10 (export « 0/N »).
// Plus jamais de fraction « 0/N » : on dit ce qui est vrai — N exigences
// relevées (chacune avec sa source si l'extrait a été retrouvé dans le DCE),
// et « dont M confirmées par vous » seulement si M > 0. Synorix ne pose jamais
// « confirmée » tout seul : seul le geste de l'utilisateur.

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

// ── Pièces (décision du 25/10, point 3) ─────────────────────────────────────
// « Jointe » est un FAIT calculé par le serveur (le fichier part dans le ZIP,
// valable et daté pour une pièce du coffre) : jamais déduit d'un statut seul.

export interface EtatPieceEntree {
  status: string
  jointe?: boolean
  piece_nom?: string | null
  valable_jusqu_au?: string | null
}

const dateFr = (iso: string) => {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}

export function etatPiece(p: EtatPieceEntree): { texte: string; ton: 'ok' | 'attention' | 'neutre' } {
  if (p.status === 'non_applicable') return { texte: 'Non concerné', ton: 'neutre' }
  if (p.jointe) {
    const fin = p.valable_jusqu_au ? ` · valable jusqu’au ${dateFr(p.valable_jusqu_au)}` : ''
    return { texte: `Jointe — ${p.piece_nom ?? 'pièce du dossier'}${fin}`, ton: 'ok' }
  }
  if (p.status === 'expire') return { texte: 'À renouveler', ton: 'attention' }
  if (p.status === 'warning') return { texte: 'Date de validité à confirmer', ton: 'attention' }
  return { texte: 'À joindre', ton: 'neutre' }
}

/** « pièces demandées, dont 3 prêtes » — le nombre total s'affiche à part. */
export function libellePieces(total: number, pretes: number): string {
  const n = total > 1 ? 'pièces demandées' : 'pièce demandée'
  if (pretes === 0) return n
  if (total === 1) return `${n}, prête`
  return `${n}, dont ${pretes} ${pretes > 1 ? 'prêtes' : 'prête'}`
}

export function resumePieces(total: number, pretes: number): string {
  return `${total} ${libellePieces(total, pretes)}`
}

// ── Écran Vérification (bloc 2, tranche 6) : mêmes faits, aucune fraction ───

/** « pièces demandées, dont 3 jointes » — le nombre total s'affiche à part. */
export function libelleJointes(total: number, jointes: number): string {
  const n = total > 1 ? 'pièces demandées' : 'pièce demandée'
  if (jointes === 0) return n
  if (total === 1) return `${n}, jointe`
  return `${n}, dont ${jointes} ${jointes > 1 ? 'jointes' : 'jointe'}`
}

/** « 4 pièces, dont 2 jointes » ; « 3 formulaires, dont 1 joint ». */
export function comptePieces(total: number, jointes: number, nom: 'pièce' | 'formulaire' = 'pièce'): string {
  const n = pluriel(total, nom)
  const accord = (k: number) => (nom === 'pièce' ? 'jointe' : 'joint') + (k > 1 ? 's' : '')
  if (jointes === 0) return n
  if (total === 1) return `${n}, ${accord(1)}`
  return `${n}, dont ${jointes} ${accord(jointes)}`
}

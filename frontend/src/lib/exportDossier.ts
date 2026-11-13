// Export du dossier — décision de Mohamed du 25/10 (export « 0/N »).
// Plus jamais de fraction « 0/N » : on dit ce qui est vrai — N exigences
// relevées (chacune avec sa source si l'extrait a été retrouvé dans le DCE),
// et « dont M confirmées par vous » seulement si M > 0. Synorix ne pose jamais
// « confirmée » tout seul : seul le geste de l'utilisateur.

import { statutPiece, type EntreeStatutPiece, type StatutPiece } from '@/lib/statutPiece'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function resumeExigences(total: number, avecSource: number, confirmees: number): string {
  if (total === 0) return "Les exigences apparaissent après l’analyse du dossier"
  let texte = `${pluriel(total, 'exigence')} ${total > 1 ? 'relevées' : 'relevée'}`
  if (avecSource >= total) texte += total > 1 ? ', chacune avec sa source' : ', avec sa source'
  if (confirmees > 0) texte += `, dont ${confirmees} ${confirmees > 1 ? 'confirmées' : 'confirmée'} par vous`
  if (avecSource < total) texte += ` · ${total - avecSource} à vérifier dans le dossier`
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

/** S6 — la ligne au-dessus de « Télécharger le dossier » : les pièces non prêtes (à joindre, ou jointes mais à
 *  confirmer : date, signature) ne partent pas dans le ZIP. Décision du 1/11 : « à joindre ou à confirmer ». */
export function phrasePiecesAJoindre(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? '1 pièce à joindre ou à confirmer. Elle ne sera pas dans le dossier.'
    : `${n} pièces à joindre ou à confirmer. Elles ne seront pas dans le dossier.`
}

/** B7 — les formulaires déposés « À relire » : ils partent dans le dossier tels quels, à relire avant le dépôt. */
export function phrasePiecesARelire(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? '1 formulaire à relire avant le dépôt. Il part dans le dossier tel que vous l’avez déposé.'
    : `${n} formulaires à relire avant le dépôt. Ils partent dans le dossier tels que vous les avez déposés.`
}

/** Le héros de l'export : ce qu'il reste à faire, en une ligne, sans couleur d'alarme (un travail à faire, pas une alerte).
 *  Les formulaires à relire sont comptés à part : ils sont dans le dossier. */
export function ligneEtatDossier(aFaire: number, alertes: number, pret: boolean, aRelire = 0): string {
  if (pret) return 'Dossier prêt pour le dépôt'
  if (aFaire > 0) {
    return `${aFaire} pièce${aFaire > 1 ? 's' : ''} à joindre ou à confirmer${aRelire > 0 ? ` · ${aRelire} à relire` : ''} avant le dépôt`
  }
  if (aRelire > 0) return `${aRelire} formulaire${aRelire > 1 ? 's' : ''} à relire avant le dépôt`
  return `${alertes} point${alertes > 1 ? 's' : ''} de contrôle à vérifier`
}

/**
 * Les pièces demandées de l'Export, rangées une fois : à joindre ou à confirmer (hors du dossier), à relire (B7 : dans le
 * dossier, à relire avant le dépôt) et prêtes. `aucuneJointe` : rien ne part encore, ni prêt ni à relire.
 */
export function bilanPiecesExport<T extends EtatPieceEntree>(
  pieces: readonly T[], echeance: string | null | undefined, signatureAConfirmer: (p: T) => boolean,
): { aFaire: T[]; aRelire: T[]; pretes: number; aucuneJointe: boolean } {
  const CONFORMES = new Set(['present', 'expiration_proche', 'non_applicable'])
  const aFaire: T[] = []
  const aRelire: T[] = []
  let pretes = 0
  for (const p of pieces) {
    if (p.status === 'non_applicable' || !pieceDemandee(p, echeance)) continue
    if (statutPiece(p, echeance).code === 'a-relire') aRelire.push(p)
    else if (!CONFORMES.has(p.status) || signatureAConfirmer(p)) aFaire.push(p)
    else pretes += 1
  }
  return { aFaire, aRelire, pretes, aucuneJointe: aFaire.length > 0 && pretes === 0 && aRelire.length === 0 }
}

/** Les pièces de la ligne « N pièces à joindre ou à confirmer » : celles que le dépôt demande (prêtes, à joindre, à confirmer,
 *  à renouveler), comme les cartes de l'écran Pièces. Une pièce facultative ou « pour l'attribution » n'est pas comptée. */
export function pieceDemandee(p: EtatPieceEntree, echeance?: string | null): boolean {
  const code = statutPiece(p, echeance).code
  return code === 'pret' || code === 'a-joindre' || code === 'a-confirmer' || code === 'a-relire' || code === 'a-renouveler'
}

/**
 * A12 — la dernière étape, dite sous « Télécharger le dossier » : le dépôt se fait hors de Synorix, sur la plateforme de
 * l'acheteur, avant la date de remise. `jour` : « 12 novembre » ; `heure` : « 14 h » ou « 14 h 30 » ; `passee` : la date
 * de remise est derrière nous (la coquille de l'AO le dit déjà : la phrase ne redonne pas une date dépassée).
 */
export function phraseDepot(remise: { jour: string; heure?: string | null; passee: boolean } | null): string {
  const debut = 'Dernière étape, hors Synorix : déposez ce dossier sur la plateforme de l’acheteur'
  if (!remise || !remise.jour) return `${debut} avant la date de remise.`
  if (remise.passee) return `${debut}.`
  return `${debut} avant le ${remise.jour}${remise.heure ? ` à ${remise.heure}` : ''}.`
}

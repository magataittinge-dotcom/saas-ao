// Statuts positifs des pièces (bloc 9, tranche 1) — fonction pure, sans JSX.
//
// Une pièce n'est jamais « manquante » ou « expirée » à l'écran : elle est
// « À joindre », « Prêt — valable jusqu'au … », « À renouveler », « Si concerné »,
// « Facultatif » ou « Pour l'attribution ». L'ambre est réservé à ce qui demande
// une action (À joindre, À renouveler, Date de validité à confirmer).
//
// Les faits viennent du serveur (GET /checklist) :
//   • jointe / valable_jusqu_au : la pièce part dans le dossier (plan du ZIP) ;
//   • obligation / phase : lecture déterministe de l'extrait du RC
//     (checklist_matcher.lire_obligation, lire_phase) ;
//   • status : état de la ligne (expire, warning, non_applicable…).
//
// Durées de validité (note_validite) — sourcées, jamais inventées :
//   • attestation URSSAF « datant de moins de six mois » : règle, Code du travail,
//     art. D8222-5 ;
//   • Kbis 3 mois, attestation de régularité fiscale 6 mois, certificats Pro BTP
//     et CIBTP 6 mois : usages courants des acheteurs, pas des textes
//     (D8222-5 cite l'extrait K ou Kbis sans durée ; service-public F21000).

export type CodeStatutPiece =
  | 'a-joindre' | 'pret' | 'a-renouveler' | 'a-confirmer'
  | 'si-concerne' | 'facultatif' | 'attribution' | 'non-concerne'

export interface EntreeStatutPiece {
  status: string
  jointe?: boolean
  /** Date de fin de validité de la pièce liée (AAAA-MM-JJ), jointe ou non. */
  valable_jusqu_au?: string | null
  obligation?: 'obligatoire' | 'si_concerne' | 'facultatif' | string
  phase?: 'depot' | 'attribution' | string
}

export interface StatutPiece {
  code: CodeStatutPiece
  texte: string
  /** Classes sémantiques (styles/pieces.css) : jamais de couleur en dur dans le JSX. */
  classe: string
  /** Vrai si le statut demande une action de l'utilisateur (ambre). */
  action: boolean
}

export function dateFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}

const fait = (code: CodeStatutPiece, texte: string, action: boolean): StatutPiece => ({
  code, texte, action, classe: `statut-piece statut-piece--${code}`,
})

/**
 * Statut d'une pièce. `echeance` (AAAA-MM-JJ, date limite de remise) permet de
 * dire « À renouveler avant le dépôt » quand la pièce prête cesse d'être
 * valable avant la remise ; sans échéance connue, la pièce reste « Prêt ».
 */
export function statutPiece(p: EntreeStatutPiece, echeance?: string | null): StatutPiece {
  if (p.status === 'non_applicable') return fait('non-concerne', 'Non concerné', false)
  const fin = p.valable_jusqu_au ? p.valable_jusqu_au.slice(0, 10) : null
  if (p.jointe) {
    const validite = fin ? ` — valable jusqu’au ${dateFr(fin)}` : ''
    if (fin && echeance && fin < echeance.slice(0, 10)) {
      return fait('a-renouveler', `À renouveler avant le dépôt${validite}`, true)
    }
    return fait('pret', `Prêt${validite}`, false)
  }
  if (p.status === 'expire') {
    return fait('a-renouveler', fin ? `À renouveler — fin de validité le ${dateFr(fin)}` : 'À renouveler', true)
  }
  if (p.status === 'warning') return fait('a-confirmer', 'Date de validité à confirmer', true)
  if (p.phase === 'attribution') return fait('attribution', 'Pour l’attribution — à préparer', false)
  if (p.obligation === 'facultatif') return fait('facultatif', 'Facultatif', false)
  if (p.obligation === 'si_concerne') return fait('si-concerne', 'Si concerné', false)
  return fait('a-joindre', 'À joindre', true)
}

/** Comptes de l'en-tête : pièces à joindre (action demandée) et pièces prêtes.
 *  « Non concerné », « Si concerné », « Facultatif » et « Pour l'attribution »
 *  ne sont pas à joindre maintenant. */
export function comptesPieces(
  pieces: readonly EntreeStatutPiece[], echeance?: string | null,
): { aJoindre: number; pretes: number } {
  let aJoindre = 0
  let pretes = 0
  for (const p of pieces) {
    const s = statutPiece(p, echeance)
    if (s.code === 'pret') pretes += 1
    else if (s.action) aJoindre += 1
  }
  return { aJoindre, pretes }
}

/** « pièces à joindre · 5 prêtes » — pour un affichage où le nombre est à part. */
export function suiteComptes(
  aJoindre: number, pretes: number, nom: 'pièce' | 'formulaire' = 'pièce',
): string {
  const prete = nom === 'pièce' ? 'prête' : 'prêt'
  return `${nom}${aJoindre > 1 ? 's' : ''} à joindre · ${pretes} ${pretes > 1 ? `${prete}s` : prete}`
}

/** « 3 pièces à joindre · 5 prêtes » — jamais de fraction. */
export function libelleComptes(
  aJoindre: number, pretes: number, nom: 'pièce' | 'formulaire' = 'pièce',
): string {
  return `${aJoindre} ${suiteComptes(aJoindre, pretes, nom)}`
}

/** Note de durée de validité d'un type de pièce du coffre, avec sa source. */
export function noteValidite(typeDocument: string): string | null {
  switch (typeDocument) {
    case 'urssaf': return 'Attestation URSSAF : valable 6 mois (Code du travail, art. D8222-5)'
    case 'kbis': return 'Kbis : 3 mois, usage courant des acheteurs'
    case 'fiscal': return 'Attestation fiscale : 6 mois, usage courant des acheteurs'
    case 'pro_btp': return 'Certificat Pro BTP : 6 mois, usage courant des acheteurs'
    case 'cibtp': return 'Certificat CIBTP : 6 mois, usage courant des acheteurs'
    default: return null
  }
}

/**
 * Statut d'une pièce du coffre-fort, hors de tout AO : mêmes mots que les
 * pièces d'un dossier. « Prêt » exige une pièce reconnue ET datée (jamais un
 * simple fichier reçu) ; une pièce sans date reste « Date de validité à confirmer ».
 */
export function statutDocument(
  d: { status: string; expiry_date?: string | null; issued_date?: string | null },
): StatutPiece {
  const fin = d.expiry_date ? d.expiry_date.slice(0, 10) : null
  if (d.status === 'expired') {
    return fait('a-renouveler', fin ? `À renouveler — fin de validité le ${dateFr(fin)}` : 'À renouveler', true)
  }
  if ((d.status === 'valid' || d.status === 'expiring_soon') && (fin || d.issued_date)) {
    return fait('pret', fin ? `Prêt — valable jusqu’au ${dateFr(fin)}` : 'Prêt', false)
  }
  return fait('a-confirmer', 'Date de validité à confirmer', true)
}

/**
 * « Déposé le 12/11/2026 par Fatima B. » — la date et l'auteur du geste qui a posé
 * la pièce (choix au coffre, formulaire rempli déposé), lus sur la ligne. Date dans
 * le fuseau de Paris (l'instant arrive en UTC). Rien tant que personne n'a rien posé.
 */
export function noteDepot(
  d: { depose_le?: string | null; depose_par?: string | null },
): string | null {
  if (!d.depose_le) return null
  const instant = new Date(d.depose_le)
  if (Number.isNaN(instant.getTime())) return null
  const jour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(instant)
  return d.depose_par ? `Déposé le ${jour} par ${d.depose_par}` : `Déposé le ${jour}`
}

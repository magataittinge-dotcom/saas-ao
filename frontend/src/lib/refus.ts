/**
 * Les refus du serveur qui demandent un autre chemin que la phrase seule (CORRECTIFS-SECURITE § 4).
 *
 * 402 SIRET (S-05, `ESSAI_EXIGE_SIRET`, backend/services/quota.py `MSG_ESSAI_SIRET`) : l'AO offert attend un SIRET vérifié ;
 * le geste utile est Mon entreprise > Identité, pas la grille des offres. Le 402 du quota (« L'essai gratuit a déjà été
 * utilisé pour ce SIRET… ») mène, lui, aux offres : on reconnaît la demande de renseigner le SIRET, pas le mot seul.
 */
export function estRefusSiret(message: string | null | undefined): boolean {
  return /renseignez le SIRET/i.test(message ?? '')
}

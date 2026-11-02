// Types de pièces du dossier (« Reconnu comme ») : un libellé lisible pour chaque
// type que le serveur sait poser (backend/models/project.py), jamais « RC » par défaut.

const LIBELLES: Record<string, string> = {
  rc: 'Règlement de la consultation (RC)',
  cctp: 'Clauses techniques (CCTP)',
  ccap: 'Clauses administratives (CCAP)',
  acte_engagement_template: "Acte d'engagement",
  dpgf_template: 'Tableau des prix (DPGF)',
  bpu_template: 'Prix unitaires (BPU)',
  dqe_template: 'Quantités estimées (DQE)',
  plan: 'Plans',
  notice: 'Notices',
  diagnostic: 'Diagnostics',
  dt: 'Réseaux (concessionnaires)',
  pgc_sps: 'Coordination sécurité (PGC SPS)',
  planning: 'Planning',
  autre: 'Autre',
  // posés par Synorix, jamais choisis à la main
  dc1_template: 'Lettre de candidature (DC1)',
  dc2_template: 'Déclaration du candidat (DC2)',
  cadre_reponse: 'Cadre de réponse',
  attestation_visite_template: 'Attestation de visite',
}

// Anciennes chaînes que le serveur n'accepte plus comme type.
const ALIAS: Record<string, string> = {
  dpgf: 'dpgf_template',
  acte_engagement: 'acte_engagement_template',
}

// Types proposés dans la liste déroulante (ordre d'affichage).
const CHOISISSABLES = [
  'rc', 'cctp', 'ccap', 'acte_engagement_template', 'dpgf_template', 'bpu_template', 'dqe_template',
  'plan', 'notice', 'diagnostic', 'dt', 'pgc_sps', 'planning', 'autre',
]

function normaliser(type: string): string {
  return ALIAS[type] ?? type
}

export function typeConnu(type: string): boolean {
  return normaliser(type) in LIBELLES
}

/** Libellé affiché : le vrai type, ou « Autre » si Synorix ne le connaît pas. */
export function libelleType(type: string): string {
  return LIBELLES[normaliser(type)] ?? LIBELLES.autre
}

/** Options de la liste déroulante, avec le type courant s'il n'est pas dans la liste. */
export function optionsType(courant: string): { value: string; label: string }[] {
  const vu = normaliser(courant)
  const valeurs = CHOISISSABLES.includes(vu) || !typeConnu(vu) ? CHOISISSABLES : [...CHOISISSABLES, vu]
  return valeurs.map((value) => ({ value, label: LIBELLES[value] }))
}

/** Valeur à lier à la liste déroulante pour ce type (jamais une valeur hors liste). */
export function valeurListe(type: string): string {
  const vu = normaliser(type)
  return typeConnu(vu) ? vu : 'autre'
}

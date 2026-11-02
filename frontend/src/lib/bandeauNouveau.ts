// Le bandeau « Nouveau » reste caché la première semaine (décision du 30/10) : un patron qui découvre Synorix
// n'a pas encore de « nouveauté » à voir. Il apparaît à partir du 7e jour de l'organisation.

export const JOURS_SANS_BANDEAU = 7

/** Vrai si l'organisation a au moins 7 jours. Le serveur envoie une date UTC, parfois sans fuseau (lue en UTC).
 *  Date absente ou illisible : vrai, le bandeau garde son comportement d'avant plutôt que de disparaître sans raison. */
export function organisationAssezAncienne(creeeLe: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!creeeLe) return true
  const brut = /(Z|[+-]\d\d:?\d\d)$/.test(creeeLe) ? creeeLe : `${creeeLe}Z`
  const debut = Date.parse(brut)
  if (Number.isNaN(debut)) return true
  return maintenant.getTime() - debut >= JOURS_SANS_BANDEAU * 24 * 3600_000
}

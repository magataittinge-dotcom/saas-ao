// La ligne « Nouveau » de l'Accueil : une nouveauté à la fois, congédiable ; la fermeture est mémorisée par identifiant dans
// ce navigateur (une nouvelle nouveauté a un nouvel identifiant et revient). Elle reste cachée la première semaine
// (décision du 30/10) : un patron qui découvre Synorix n'a pas encore de « nouveauté » à voir. Texte sobre.

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

/** La nouveauté en cours : une phrase, et l'endroit où la voir. */
export const NOUVEAUTE = {
  id: 'source-surlignee-2026-10',
  texte: 'Chaque exigence s’ouvre sur sa source : le passage du dossier de l’acheteur est surligné dans la pièce.',
  lien: { to: '/projects', libelle: 'Ouvrir un appel d’offres' },
} as const

/** La clé de mémorisation : la même que celle de l'ancien bandeau de la coquille (une nouveauté déjà fermée le reste). */
export const cleNouveaute = (id: string = NOUVEAUTE.id): string => `synorix.bandeau.${id}`

type Rangement = Pick<Storage, 'getItem' | 'setItem'>
const rangement = (): Rangement | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

/** La nouveauté a déjà été congédiée dans ce navigateur. Stockage indisponible : non (la ligne reviendra). */
export function nouveauteFermee(stock: Rangement | null = rangement()): boolean {
  try { return stock?.getItem(cleNouveaute()) === 'ferme' } catch { return false }
}

export function fermerNouveaute(stock: Rangement | null = rangement()): void {
  try { stock?.setItem(cleNouveaute(), 'ferme') } catch { /* stockage indisponible : la ligne reviendra */ }
}

/** La ligne se montre : organisation chargée, assez ancienne, nouveauté pas encore congédiée. */
export function nouveauteVisible(organisation: { created_at?: string } | null | undefined, fermee: boolean, maintenant: Date = new Date()): boolean {
  return !fermee && organisation != null && organisationAssezAncienne(organisation.created_at, maintenant)
}

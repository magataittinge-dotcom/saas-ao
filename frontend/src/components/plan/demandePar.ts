import type { SourcePlan } from '@/lib/planMemoire'

/**
 * Qui demande cette partie : le règlement de la consultation ou le cahier des clauses techniques (CCTP), lu dans le nom
 * de la pièce d'où vient l'annonce. Quand le nom ne dit rien, « le dossier » : on n'affirme que ce qu'on sait.
 */
export function demandePar(source: SourcePlan | null | undefined): string {
  const nom = (source?.document ?? '').toLowerCase()
  if (/cctp|clauses?\s+techniques?/.test(nom)) return 'Demandé par le cahier des clauses techniques (CCTP)'
  if (/(^|[^a-z0-9])rc([^a-z0-9]|$)|r[eè]glement/.test(nom)) return 'Demandé par le règlement de la consultation'
  return 'Demandé par le dossier'
}

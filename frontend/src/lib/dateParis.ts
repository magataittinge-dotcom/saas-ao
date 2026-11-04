/**
 * La mise en forme des dates et heures de Synorix : toujours à l'heure de Paris, quel que soit le fuseau de l'ordinateur
 * ou du serveur (recette du 4/11 : « Plan validé le 3 novembre » affiché à 0 h 05 le 4, heure de Paris).
 *
 * Le serveur envoie des dates SANS fuseau (« 2026-11-03T23:30:00 »), toujours en UTC : `new Date(...)` les lirait à l'heure
 * locale. `lireDate` les prend pour de l'UTC ; une date seule (« 2026-11-03 ») reste le jour écrit.
 */
const FUSEAU = 'Europe/Paris'

/** Une date du serveur, lue en UTC quand elle n'a pas de fuseau ; null si elle est illisible. */
export function lireDate(valeur: string | Date | null | undefined): Date | null {
  if (!valeur) return null
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : valeur
  const brut = valeur.trim()
  const sansFuseau = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(brut)
  const d = new Date(sansFuseau ? `${brut}Z` : brut)
  return Number.isNaN(d.getTime()) ? null : d
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function partiesParis(d: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, ...options }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** « 4 nov. » (à l'heure de Paris) ; chaîne vide si la date est illisible. */
export function jourCourtParis(valeur: string | Date | null | undefined): string {
  const d = lireDate(valeur)
  if (!d) return ''
  const p = partiesParis(d, { day: 'numeric', month: 'numeric' })
  return `${Number(p.day)} ${MOIS_COURTS[Number(p.month) - 1]}`
}

/** « 4 novembre » (à l'heure de Paris) ; chaîne vide si la date est illisible. */
export function jourLongParis(valeur: string | Date | null | undefined): string {
  const d = lireDate(valeur)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: 'numeric', month: 'long' }).format(d)
}

/** « 14:05 » (à l'heure de Paris) ; chaîne vide si la date est illisible. */
export function heureParis(valeur: string | Date | null | undefined): string {
  const d = lireDate(valeur)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' }).format(d)
}

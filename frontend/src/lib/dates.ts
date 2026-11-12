// Les dates mises en forme avec date-fns (et sa locale française), séparées de `lib/utils.ts` (RESTES-2) : `cn`, importé
// par presque tous les composants, ne fait plus charger date-fns dans l'entrée du front.
import { formatDistanceToNow, differenceInDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr })
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr })
}

export function daysUntil(date: string | Date): number {
  return differenceInDays(new Date(date), new Date())
}

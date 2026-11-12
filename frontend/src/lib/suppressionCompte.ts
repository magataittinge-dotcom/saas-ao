/**
 * « Supprimer mon compte » (Paramètres > Compte), décision D23 du 12/11 : sans abonnement payé, la suppression est
 * immédiate et définitive ; avec un abonnement payé, elle attend la fin de la période payée (le compte reste ouvert
 * jusque-là, le mois entamé n'est pas remboursé) et s'annule tant que la date n'est pas passée. Les phrases vivent ici,
 * les routes dans backend/routers/users.py.
 */
import axios from 'axios'
import { lireDate } from './dateParis'

/** Réponse de GET /users/me/suppression : ce que le dialogue annonce avant de confirmer. */
export interface ApercuSuppression {
  immediate: boolean
  fin_de_periode: string | null
  suppression_prevue_le: string | null
}

/** « 14 mars 2030 », à l'heure de Paris ; chaîne vide si la date est illisible. */
export function dateSuppression(valeur: string | null | undefined): string {
  const d = lireDate(valeur)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

export const PHRASE_IMMEDIATE =
  'Votre compte et toutes vos données (AO, mémoires, coffre-fort, entreprise) sont supprimés tout de suite. Cette suppression est définitive.'

/** La phrase du dialogue, selon le cas. */
export function phraseDialogue(apercu: Pick<ApercuSuppression, 'immediate' | 'fin_de_periode'>): string {
  if (apercu.immediate) return PHRASE_IMMEDIATE
  const date = dateSuppression(apercu.fin_de_periode)
  const arret = date ? `Votre abonnement s’arrête le ${date}.` : 'Votre abonnement s’arrête à la fin de la période payée.'
  return `${arret} Votre compte reste ouvert jusqu’à cette date, puis toutes vos données sont supprimées. Le mois entamé n’est pas remboursé.`
}

/** Le libellé du bouton qui confirme : le geste dit ce qu'il fait. */
export function libelleConfirmer(apercu: Pick<ApercuSuppression, 'immediate'>): string {
  return apercu.immediate ? 'Supprimer définitivement' : 'Programmer la suppression'
}

/** La rangée du compte une fois la demande faite. */
export function libelleSuppressionPrevue(prevue: string | null | undefined): string {
  const date = dateSuppression(prevue)
  return date ? `Suppression prévue le ${date}` : 'Suppression prévue à la fin de la période payée'
}

/**
 * Message d'un refus de ces routes : la phrase du serveur telle quelle, 502 et 500 compris (elles disent ce qui a été
 * fait et ce qui ne l'a pas été) ; sinon, la phrase calme de l'écran.
 */
export function messageRefusCompte(err: unknown, defaut: string): string {
  if (!axios.isAxiosError(err)) return defaut
  const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
  return typeof detail === 'string' && detail.trim() ? detail : defaut
}

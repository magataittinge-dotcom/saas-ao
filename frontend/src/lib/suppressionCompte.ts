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
  /** Demande posée : « Annuler la suppression » reprend-il un abonnement (un seul, celui que la demande avait arrêté) ? */
  abonnement_repris?: boolean
  /** Et la date de son prochain prélèvement, si le serveur la connaît. */
  prochain_prelevement?: string | null
}

/**
 * « 14 mars 2030 », à l'heure de Paris ; chaîne vide si la date est illisible. Espaces insécables : la date tient sur
 * une ligne (à 1 440, « le 12 / décembre 2026 » se coupait entre le jour et le mois).
 */
export function dateSuppression(valeur: string | null | undefined): string {
  const d = lireDate(valeur)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })
    .format(d)
    .replace(/\s/g, ' ')
}

/** Point 74 : supprimer le compte efface toute l'organisation, le geste est à l'administrateur (le serveur refuse en 403). */
export const PHRASE_MEMBRE = 'La suppression du compte est réservée à l’administrateur de votre entreprise : adressez-vous à lui.'

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

/**
 * La phrase de la confirmation de « Annuler la suppression » (relecture du 12/11, P1-3) : le compte et les données
 * restent, et ce que devient l'abonnement. Le serveur ne reprend que l'abonnement que la demande avait arrêté : s'il
 * n'y en a pas (arrêté par le client avant sa demande), la phrase ne promet pas de reprise.
 */
export function phraseAnnulation(apercu: Pick<ApercuSuppression, 'abonnement_repris' | 'prochain_prelevement'>): string {
  const garde = 'Votre compte et toutes vos données sont conservés.'
  if (!apercu.abonnement_repris) return `${garde} Votre abonnement reste arrêté, comme avant votre demande.`
  const date = dateSuppression(apercu.prochain_prelevement)
  return date
    ? `${garde} Votre abonnement reprend : prochain prélèvement le ${date}.`
    : `${garde} Votre abonnement reprend : il se renouvelle à la fin de la période en cours.`
}

/** Le libellé du bouton qui confirme l'annulation : le geste dit ce qu'il fait. */
export function libelleConfirmerAnnulation(apercu: Pick<ApercuSuppression, 'abonnement_repris'>): string {
  return apercu.abonnement_repris ? 'Reprendre l’abonnement' : 'Garder mon compte'
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

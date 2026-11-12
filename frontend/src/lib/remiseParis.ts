// Q-08 (restes 2) — LE modèle des dates de remise : une remise est une heure murale de Paris (le RC écrit « 14h00 » et
// parle de Paris), lue et comparée à l'heure de Paris, quel que soit le fuseau de l'ordinateur ou du serveur. Fonctions
// pures (Intl, aucune dépendance) ; `maintenant` est un instant, les jours se comptent sur le calendrier de Paris.
// `lib/echeance.ts` (momentLimite, etatEcheance) s'appuie dessus ; les écrans affichent `limite` par jourSemaineParis,
// heureCourteParis ou momentParis, jamais par les accesseurs locaux de Date (getHours, getDate…).
import type { EcheanceSource } from './echeance'

const FUSEAU = 'Europe/Paris'
const MINUTE = 60_000
const JOUR = 86_400_000

export interface MomentParis { an: number; mois: number; jour: number; heure: number; minute: number; seconde: number }

const PARTIES = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSEAU, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** Ce que marque l'horloge de Paris à cet instant (mois de 1 à 12). */
export function momentParis(instant: Date): MomentParis {
  const p = Object.fromEntries(PARTIES.formatToParts(instant).map((x) => [x.type, x.value]))
  return { an: Number(p.year), mois: Number(p.month), jour: Number(p.day), heure: Number(p.hour) % 24, minute: Number(p.minute), seconde: Number(p.second) }
}

/** L'avance de Paris sur UTC à cet instant, en minutes : 60 l'hiver, 120 l'été. */
export function decalageParis(instant: Date): number {
  const m = momentParis(instant)
  const murale = Date.UTC(m.an, m.mois - 1, m.jour, m.heure, m.minute, m.seconde)
  return Math.round((murale - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE)
}

/**
 * L'instant où l'horloge de Paris marque ce moment. Heure qui n'existe pas (passage à l'heure d'été, 2 h → 3 h) : l'heure
 * d'après (2 h 30 → 3 h 30). Heure qui existe deux fois (passage à l'heure d'hiver, 3 h → 2 h) : la première (heure d'été).
 */
export function instantParis(an: number, mois: number, jour: number, heure = 0, minute = 0, seconde = 0): Date {
  const murale = Date.UTC(an, mois - 1, jour, heure, minute, seconde)
  const avant = decalageParis(new Date(murale - 3 * 60 * MINUTE))
  const apres = decalageParis(new Date(murale + 3 * 60 * MINUTE))
  for (const decalage of [...new Set([avant, apres])].sort((a, b) => b - a)) {
    const instant = new Date(murale - decalage * MINUTE)
    const m = momentParis(instant)
    if (m.jour === jour && m.heure === heure && m.minute === minute) return instant
  }
  return new Date(murale - avant * MINUTE)
}

/** Le moment limite d'une remise, à l'heure de Paris ; sans heure : 23:59:59 le jour dit. Null si la date est illisible. */
export function momentLimiteParis(source: EcheanceSource | null | undefined): Date | null {
  const m = source?.date?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [an, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = (source?.heure ?? '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i)
  return h ? instantParis(an, mois, jour, Number(h[1]), Number(h[2] ?? 0)) : instantParis(an, mois, jour, 23, 59, 59)
}

/** Jours du calendrier de Paris entre `maintenant` et `limite` (0 = le même jour à Paris, négatif = passé). */
export function joursParis(limite: Date, maintenant: Date): number {
  const a = momentParis(limite)
  const b = momentParis(maintenant)
  return Math.round((Date.UTC(a.an, a.mois - 1, a.jour) - Date.UTC(b.an, b.mois - 1, b.jour)) / JOUR)
}

/** « 14h00 » : l'heure limite à Paris, comme l'écrit l'état « Aujourd'hui, 14h00 ». */
export function heureLimiteParis(limite: Date): string {
  const m = momentParis(limite)
  return `${m.heure}h${String(m.minute).padStart(2, '0')}`
}

/** « 14 h » ou « 14 h 30 » à Paris (la phrase « Vendredi 10 avril, 14 h »). */
export function heureCourteParis(instant: Date): string {
  const m = momentParis(instant)
  return m.minute ? `${m.heure} h ${String(m.minute).padStart(2, '0')}` : `${m.heure} h`
}

const JOUR_SEMAINE = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' })

/** « vendredi 10 avril » : le jour à Paris, avec son nom. */
export function jourSemaineParis(instant: Date): string {
  return JOUR_SEMAINE.format(instant)
}

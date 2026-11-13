// B2 — les jours ouvrés qui restent avant une remise : du lundi au vendredi, hors jours fériés, au calendrier de Paris.
//
// Source des jours fériés : Code du travail, article L3133-1 : « Les fêtes légales ci-après désignées sont des jours
// fériés : 1° Le 1er janvier ; 2° Le lundi de Pâques ; 3° Le 1er mai ; 4° Le 8 mai ; 5° L'Ascension ; 6° Le lundi de
// Pentecôte ; 7° Le 14 juillet ; 8° L'Assomption ; 9° La Toussaint ; 10° Le 11 novembre ; 11° Le jour de Noël. »
// Les jours propres à l'Alsace-Moselle (Vendredi saint, 26 décembre : L3134-13) et à l'outre-mer ne sont pas comptés.
// Pâques : calcul grégorien de Meeus, Jones et Butcher ; lundi de Pâques = Pâques + 1 jour, Ascension = + 39,
// lundi de Pentecôte = + 50.
//
// Ce compte est une aide de lecture (« il reste quatre jours de bureau »), pas un délai juridique : la date et
// l'heure limites restent celles du règlement.
import { momentParis } from './remiseParis'

const JOUR = 86_400_000

/** Le dimanche de Pâques de l'année (mois de 1 à 12). */
export function paques(an: number): { mois: number; jour: number } {
  const a = an % 19
  const b = Math.floor(an / 100)
  const c = an % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return { mois, jour }
}

const FIXES: readonly (readonly [number, number])[] = [[1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]]
/** Lundi de Pâques, Ascension, lundi de Pentecôte : en jours après le dimanche de Pâques. */
const MOBILES = [1, 39, 50] as const

/** Ce jour est-il l'un des onze jours fériés de L3133-1 ? (mois de 1 à 12) */
export function estFerie(an: number, mois: number, jour: number): boolean {
  if (FIXES.some(([m, j]) => m === mois && j === jour)) return true
  const p = paques(an)
  const dimanche = Date.UTC(an, p.mois - 1, p.jour)
  const ce = Date.UTC(an, mois - 1, jour)
  return MOBILES.some((n) => dimanche + n * JOUR === ce)
}

/**
 * Les jours ouvrés entre aujourd'hui (non compté) et le jour de la remise (compté s'il est ouvré), au calendrier de
 * Paris. Zéro quand la remise est aujourd'hui, passée, ou qu'il ne reste que des samedis, dimanches et jours fériés.
 */
export function joursOuvresRestants(limite: Date, maintenant: Date = new Date()): number {
  const a = momentParis(maintenant)
  const b = momentParis(limite)
  const fin = Date.UTC(b.an, b.mois - 1, b.jour)
  let n = 0
  for (let t = Date.UTC(a.an, a.mois - 1, a.jour) + JOUR; t <= fin; t += JOUR) {
    const d = new Date(t)
    const semaine = d.getUTCDay()
    if (semaine !== 0 && semaine !== 6 && !estFerie(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())) n += 1
  }
  return n
}

/** « 4 jours ouvrés », « 1 jour ouvré », « aucun jour ouvré ». */
export function libelleJoursOuvres(n: number): string {
  if (n <= 0) return 'aucun jour ouvré'
  return n === 1 ? '1 jour ouvré' : `${n} jours ouvrés`
}

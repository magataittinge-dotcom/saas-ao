// Grille des offres — SOURCE UNIQUE de tout ce qui s'affiche sur les prix et les
// quotas : page d'accueil, Tarifs, Facturation, Paramètres, mur d'abonnement.
// Grille décidée le 2026-10-22, quotas revus le 2026-11-11 (décision du fondateur :
// plus aucune offre illimitée ; Pro 30 + 30, Business 70 + 70, prix inchangés).
// Les quotas appliqués par le serveur sont dans
// backend/services/quota.py (PLAN_LIMITS) : tests/offres.test.tsx vérifie que
// les deux disent la même chose. Les prix facturés viennent des produits Stripe.

export type OffreId = 'essentiel' | 'pro' | 'business'

export interface Offre {
  id: OffreId
  nom: string
  /** Prix mensuel hors taxes, en euros. */
  prixMensuelHT: number
  /** Quota du mois : chaque offre a un nombre, aucune n'est illimitée. */
  analysesParMois: number
  memoiresParMois: number
}

export const OFFRES: readonly Offre[] = [
  { id: 'essentiel', nom: 'Essentiel', prixMensuelHT: 149, analysesParMois: 5, memoiresParMois: 5 },
  { id: 'pro', nom: 'Pro', prixMensuelHT: 349, analysesParMois: 30, memoiresParMois: 30 },
  { id: 'business', nom: 'Business', prixMensuelHT: 599, analysesParMois: 70, memoiresParMois: 70 },
]

/** Essai offert à la création du compte, une seule fois. */
export const ESSAI = { ao: 1, analyses: 1, memoires: 1 } as const

/** Ce que comprend chaque offre : les trois donnent accès aux mêmes fonctions, seuls les quotas changent. */
export const INCLUS: readonly string[] = [
  'Analyse du dossier, chaque exigence avec sa source',
  'Mémoire technique rédigé, export Word et PDF',
  "Dossier complet en ZIP, dans l’ordre du règlement de la consultation",
  'Coffre-fort documentaire, alerte avant expiration',
]

export function trouverOffre(id: string | null | undefined): Offre | undefined {
  return OFFRES.find((o) => o.id === id)
}

/** Nom affiché d'un plan d'organisation, essai compris. */
export function nomPlan(plan: string | null | undefined): string {
  return trouverOffre(plan)?.nom ?? 'Essai'
}

/** « 149 € » (espace insécable). */
export function prixLibelle(offre: Offre): string {
  return `${offre.prixMensuelHT} €`
}

/** « 5 analyses + 5 mémoires par mois ». */
export function quotaLibelle(offre: Offre): string {
  return `${offre.analysesParMois} analyses + ${offre.memoiresParMois} mémoires par mois`
}

export const ESSAI_LIBELLE = `Essai : ${ESSAI.ao} AO offert à la création du compte, analyse et mémoire compris.`

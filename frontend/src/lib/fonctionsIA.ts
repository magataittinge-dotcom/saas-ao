// Les quatre fonctions à appel d'IA (C1 à C4), éteintes par défaut côté serveur (backend/services/fonctions_ia.py).
// L'écran les lit sur GET /api/fonctions-ia et ne montre un bouton que si le serveur dit la fonction allumée : en
// chargement, en erreur ou sans réponse, tout reste éteint (l'écran d'aujourd'hui, inchangé).
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export interface FonctionsIA {
  /** C1 — « Proposer un paragraphe » sur une ligne « À couvrir » de la relecture. */
  relecture_proposer: boolean
  /** C2 — la réécriture d'un passage en trois propositions, avec « Voir les différences ». */
  reecrire_trois: boolean
  /** C3 — « Ce que vous voulez dire » de chaque fiche du plan, proposé puis validé. */
  fiche_proposee: boolean
  /** C4 — « Le style de mon entreprise », lu dans un ancien mémoire (lecture seule). */
  style_entreprise: boolean
}

export const TOUT_ETEINT: FonctionsIA = Object.freeze({
  relecture_proposer: false, reecrire_trois: false, fiche_proposee: false, style_entreprise: false,
})

/** Seul un `true` explicite allume : toute autre valeur (absente, chaîne, nombre) reste éteinte. */
export function lireFonctionsIA(brut: unknown): FonctionsIA {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>
  return {
    relecture_proposer: o.relecture_proposer === true,
    reecrire_trois: o.reecrire_trois === true,
    fiche_proposee: o.fiche_proposee === true,
    style_entreprise: o.style_entreprise === true,
  }
}

export function useFonctionsIA(): FonctionsIA {
  const { data } = useQuery({
    queryKey: ['fonctions-ia'],
    queryFn: async () => lireFonctionsIA((await api.get('/fonctions-ia')).data),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? TOUT_ETEINT
}

/** Le détail d'une erreur du serveur s'il est une phrase, sinon la phrase donnée. */
export function detailErreur(err: unknown, defaut: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : defaut
}

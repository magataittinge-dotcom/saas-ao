// E3 — l'état d'une partie du mémoire : « Rédigée » (par défaut) ou « À refaire », choisi par le patron.
// Rien d'autre : ni statuts multiples, ni rôle, ni responsable, ni échéance.
import type { MemoireContent } from '@/types'

export type EtatPartie = 'redigee' | 'a_refaire'

export const LIBELLE_ETAT: Record<EtatPartie, string> = { redigee: 'Rédigée', a_refaire: 'À refaire' }

export type EtatsSections = Record<string, 'a_refaire'>

/** « partie_b.dechets » : la clé d'une sous-section, la même que côté serveur. */
export const cleSection = (part: string, cle: string) => `${part}.${cle}`

export function etatDe(etats: EtatsSections | null | undefined, part: string, cle: string): EtatPartie {
  return etats?.[cleSection(part, cle)] === 'a_refaire' ? 'a_refaire' : 'redigee'
}

/** Les états tels que le serveur les garde dans le mémoire. */
export function etatsDuMemoire(contenu: MemoireContent | null | undefined): EtatsSections {
  return contenu?._etat_sections ?? {}
}

/** « 2 parties à refaire » ; null s'il n'y en a aucune. */
export function bilanARefaire(etats: EtatsSections | null | undefined): string | null {
  const n = Object.values(etats ?? {}).filter((e) => e === 'a_refaire').length
  return n === 0 ? null : `${n} partie${n > 1 ? 's' : ''} à refaire`
}

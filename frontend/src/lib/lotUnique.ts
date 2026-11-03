// Un dossier à un seul lot (ou à marché unique, sans lots) : l'écran Lots n'a rien à faire choisir. Pur, sans réseau.
// Le serveur range chaque lot repéré dans `lots_detectes` ; `!!` est le marqueur d'un fichier de prix illisible
// (Excel protégé) et la source `error` une détection en échec : dans ces cas, l'écran Lots garde la main.
import type { LotOption } from '@/types'

export interface LotUnique {
  /** Identifiant du lot ; null pour un marché unique (le serveur lit alors tout le dossier). */
  id: string | null
  /** La désignation affichée : celle du lot, ou l'objet du marché (le nom de l'AO) quand il n'y a pas de lots. */
  designation: string
  marcheUnique: boolean
}

type ProjetLots = { name?: string | null; lots_detectes?: readonly LotOption[] | null }

/**
 * Le lot unique du dossier, ou null : détection pas encore faite (`lots_detectes` absent), plusieurs lots, ou détection
 * en échec. `lots` remplace `lots_detectes` quand la route des lots vient de répondre.
 */
export function lotUniqueDuDossier(projet: ProjetLots, lots?: readonly LotOption[] | null): LotUnique | null {
  const detectes = lots ?? projet.lots_detectes
  if (!Array.isArray(detectes)) return null
  if (detectes.some((l) => l.id === '!!' || l.sources?.includes('error'))) return null
  if (detectes.length === 1) {
    const l = detectes[0]
    const designation = (l.user_label || l.nom || '').trim()
    return designation ? { id: l.id, designation, marcheUnique: false } : null
  }
  if (detectes.length === 0) {
    const objet = (projet.name ?? '').trim()
    return objet ? { id: null, designation: objet, marcheUnique: true } : null
  }
  return null
}

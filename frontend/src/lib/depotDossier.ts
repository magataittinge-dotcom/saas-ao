// Étape « Dépôt du dossier » : les cartes du résumé, tirées des pièces déjà reconnues — pur, sans réseau.
import type { CarteResume } from '@/components/etape'
import { libelleType } from '@/lib/typesPieces'
import { tailleFichier } from '@/lib/tailleFichier'
import type { Project, ProjectDocument } from '@/types'

/** Statuts du projet pendant que le serveur lit le dossier (l'utilisateur peut avoir quitté la page). */
export const ETATS_LECTURE_SERVEUR: readonly string[] = ['uploading', 'extracting_zip', 'extracting_text', 'detecting_lots']

const TYPES_CLES = ['rc', 'ccap', 'cctp', 'dpgf', 'acte_engagement'] as const

/** Fichiers déposés, pièces clés reconnues (règlement, clauses, prix, engagement), et ce qui reste à classer. Rien sans pièce. */
export function cartesDepot(documents: readonly Pick<ProjectDocument, 'type' | 'file_size'>[], project?: Pick<Project, 'lots_detectes'> | null): CarteResume[] {
  if (documents.length === 0) return []
  const reconnues = TYPES_CLES.filter((t) => documents.some((d) => d.type === t))
  const aClasser = documents.filter((d) => !d.type || d.type === 'autre').length
  const total = documents.reduce((s, d) => s + (d.file_size || 0), 0)
  const cartes: CarteResume[] = [
    { libelle: 'Fichiers déposés', valeur: String(documents.length), etat: 'neutre', detail: total > 0 ? tailleFichier(total) : undefined },
    {
      libelle: 'Pièces clés reconnues', valeur: `${reconnues.length} sur ${TYPES_CLES.length}`, etat: reconnues.length > 0 ? 'pret' : 'a-verifier',
      jauge: { rempli: reconnues.length, total: TYPES_CLES.length },
      detail: reconnues.length ? reconnues.map((t) => libelleType(t)).join(' · ') : 'Choisissez le type de chaque pièce dans la liste.',
    },
    { libelle: 'À classer', valeur: String(aClasser), etat: aClasser > 0 ? 'a-verifier' : 'pret', detail: aClasser > 0 ? 'Indiquez ce que sont ces fichiers dans la liste ci-dessous.' : 'Tous les fichiers sont reconnus.' },
  ]
  const lots = project?.lots_detectes?.length ?? 0
  if (lots > 0) cartes.push({ libelle: 'Lots détectés', valeur: String(lots), etat: 'neutre', detail: lots === 1 ? 'Un seul lot : la lecture se lance depuis cette page.' : 'À choisir à l’étape suivante.' })
  return cartes
}

// Étape « Dépôt du dossier » : les cartes du résumé, tirées des pièces déjà reconnues — pur, sans réseau.
import type { CarteResume } from '@/components/etape'
import { libelleType } from '@/lib/typesPieces'
import { tailleFichier } from '@/lib/tailleFichier'
import type { LotUnique } from '@/lib/lotUnique'
import type { Project, ProjectDocument } from '@/types'

/** Statuts du projet pendant que le serveur lit le dossier (l'utilisateur peut avoir quitté la page). */
export const ETATS_LECTURE_SERVEUR: readonly string[] = ['uploading', 'extracting_zip', 'extracting_text', 'detecting_lots']

const TYPES_CLES = ['rc', 'ccap', 'cctp', 'dpgf', 'acte_engagement'] as const

/** Fichiers déposés, pièces clés reconnues (règlement, clauses, prix, engagement), et ce qui reste à classer. Rien sans pièce. */
export function cartesDepot(documents: readonly Pick<ProjectDocument, 'type' | 'file_size'>[], project?: Pick<Project, 'lots_detectes'> | null, lotUnique?: LotUnique | null): CarteResume[] {
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
  // Un lot (ou un marché unique) : la carte le dit, il n'y a rien à choisir à l'étape suivante. « Lot unique » en grand ; la
  // désignation (longue, au choix du maître d'ouvrage) en texte normal sous la valeur, deux lignes au plus.
  if (lotUnique) cartes.push({ libelle: 'Lots détectés', valeur: 'Lot unique', designation: lotUnique.designation, etat: 'neutre', detail: 'L’analyse se lance depuis cette page.' })
  else {
    const lots = project?.lots_detectes?.length ?? 0
    if (lots > 0) cartes.push({ libelle: 'Lots détectés', valeur: String(lots), etat: 'neutre', detail: 'À choisir à l’étape suivante.' })
  }
  return cartes
}

/** Les fichiers que Synorix n'a pas su ranger : le seul geste que l'écran de dépôt demande. */
export const estAClasser = (d: Pick<ProjectDocument, 'type'>): boolean => !d.type || d.type === 'autre'

const enumerer = (mots: string[]): string => (mots.length <= 1 ? mots[0] ?? '' : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`)
const NOMS_CLES: Record<(typeof TYPES_CLES)[number], string> = {
  rc: 'le règlement', ccap: 'les clauses administratives', cctp: 'les clauses techniques', dpgf: 'le tableau des prix', acte_engagement: 'l’acte d’engagement',
}

/**
 * Le dossier déposé, dit en une ligne de faits sous le titre de la liste (jury, tour 1 : quatre cases égales, deux traitements
 * dans la même rangée, des pastilles « Prêt » sur des comptes) : combien de fichiers et leur poids, les pièces clés reconnues
 * en mots du métier, les lots repérés. Ce qui reste à classer n'est pas ici : c'est l'exception, dite à part (`estAClasser`).
 */
export function faitsDepot(documents: readonly Pick<ProjectDocument, 'type' | 'file_size'>[], project?: Pick<Project, 'lots_detectes'> | null, lotUnique?: LotUnique | null): string {
  if (documents.length === 0) return ''
  const total = documents.reduce((s, d) => s + (d.file_size || 0), 0)
  const reconnues = TYPES_CLES.filter((t) => documents.some((d) => d.type === t))
  const lots = project?.lots_detectes?.length ?? 0
  const faits = [
    `${documents.length} ${documents.length > 1 ? 'fichiers' : 'fichier'}${total > 0 ? `, ${tailleFichier(total)}` : ''}`,
    reconnues.length > 0 ? `Synorix a reconnu ${enumerer(reconnues.map((t) => NOMS_CLES[t]))}` : null,
    lotUnique ? null : lots > 1 ? `${lots} lots repérés, à choisir à l’étape suivante` : null,
  ]
  return `${faits.filter(Boolean).join('. ')}.`
}

// F-05 (audit QUALITE-FRONT) — ouvrir un AO sans cascade. Avant : clic → morceau de la page d'un AO → GET /projects/:id →
// morceau de l'étape → données de l'étape, l'un après l'autre. Maintenant :
//  - au survol, au focus ou au toucher d'un lien vers un AO (Mes AO, Accueil), la page d'un AO, le morceau de son étape,
//    la requête du projet et les premières lectures de l'étape quand on les connaît partent ensemble ;
//  - à l'ouverture directe d'une adresse (`/projects/:id/export`), le morceau de l'étape et ses lectures partent en même
//    temps que la requête du projet (l'étape est dans l'adresse), au lieu d'attendre la réponse.
// Les chemins des étapes sont ceux des `lazy()` de routes/Project.tsx : un seul morceau par étape (un test les compare).
import { useContext } from 'react'
import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import { lireProjet } from '@/hooks/useProject'
import { api } from '@/services/api'
import { actionEtape } from '@/lib/intelligence/action'
import type { Project } from '@/types'

export const MORCEAUX_ETAPES: Readonly<Record<string, () => Promise<unknown>>> = {
  upload: () => import('@/routes/project/StepUpload'),
  lots: () => import('@/routes/project/StepLotSelection'),
  analysis: () => import('@/routes/project/StepAnalysis'),
  verification: () => import('@/routes/project/StepVerification'),
  plan: () => import('@/routes/project/StepPlan'),
  memoire: () => import('@/routes/project/StepMemoire'),
  export: () => import('@/routes/project/StepExport'),
}

// Les premières lectures d'une étape, partagées avec l'étape elle-même (même clé, même lecture) : elles partent avec la
// requête du projet au lieu d'attendre le morceau de l'étape. « Télécharger le dossier » d'abord (l'étape la plus ouverte
// depuis Mes AO et l'Accueil quand le mémoire est rédigé).
export function lectureDetailExport<T>(id: string) {
  return { queryKey: ['export-detail', id], queryFn: async (): Promise<T> => (await api.get<T>(`/projects/${id}/export/detail`)).data }
}
export function lectureScoreExport<T>(id: string) {
  return { queryKey: ['checklist-score', id], queryFn: async (): Promise<T> => (await api.get<T>(`/projects/${id}/checklist/score`)).data }
}
const LECTURES_ETAPES: Readonly<Record<string, (id: string) => { queryKey: unknown[]; queryFn: () => Promise<unknown> }[]>> = {
  export: (id) => [lectureDetailExport(id), lectureScoreExport(id)],
}

/** Les données de l'étape (celles qu'on connaît), gardées 30 s : l'étape les trouve en arrivant. */
export function prechargerDonneesEtape(client: QueryClient | undefined, segment: string | null | undefined, id: string): void {
  if (!client || !segment) return
  for (const lecture of LECTURES_ETAPES[segment]?.(id) ?? []) void client.prefetchQuery({ ...lecture, staleTime: 30_000 })
}

const demandes = new Set<string>()

/** Une seule demande par morceau ; un échec (hors ligne) la rend de nouveau possible. */
function charger(cle: string, importer: (() => Promise<unknown>) | undefined): void {
  if (!importer || demandes.has(cle)) return
  demandes.add(cle)
  importer().catch(() => { demandes.delete(cle) })
}

/** Le morceau d'une étape (`upload`, `export`…) ; un segment inconnu ne fait rien. */
export function prechargerEtape(segment: string | null | undefined): void {
  if (segment) charger(segment, MORCEAUX_ETAPES[segment])
}

/** L'étape visée par un lien vers un AO : celle de l'adresse, sinon celle où l'index de l'AO renvoie. */
export function segmentDuLien(projet: Project, lien?: string): string {
  return lien?.match(/^\/projects\/[^/]+\/(\w+)/)?.[1] ?? actionEtape(projet).segment
}

/** Tout ce qu'il faut pour ouvrir cet AO : la page, le morceau de l'étape, la requête du projet (gardée 30 s). */
export function prechargerAO(client: QueryClient | undefined, projet: Project, lien?: string): void {
  charger('page-ao', () => import('@/routes/Project'))
  const segment = segmentDuLien(projet, lien)
  prechargerEtape(segment)
  void client?.prefetchQuery({ queryKey: ['projects', projet.id], queryFn: () => lireProjet(projet.id), staleTime: 30_000 })
  prechargerDonneesEtape(client, segment, projet.id)
}

/** Les gestes d'un lien vers un AO qui lancent le préchargement. Sans fournisseur de requêtes (rendu de test) : les morceaux seuls. */
export function usePrechargementAO(): (projet: Project, lien?: string) => { onMouseEnter: () => void; onFocus: () => void; onTouchStart: () => void } {
  const client = useContext(QueryClientContext)
  return (projet, lien) => {
    const lancer = () => prechargerAO(client, projet, lien)
    return { onMouseEnter: lancer, onFocus: lancer, onTouchStart: lancer }
  }
}

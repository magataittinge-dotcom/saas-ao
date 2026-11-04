// B1 — « La lecture n'a pas démarré » : l'écran Décider d'un AO sans aucune exigence lue, sans lecture en cours et sans
// échec enregistré. C'est l'état d'un AO dont le lancement de la lecture a échoué (pré-vol IA, coupure) : le serveur
// n'a rien commencé, il n'y a donc rien à attendre. Avant, l'écran affichait « 0 % » sans fin.

type PhaseFlux = 'pending' | 'in_progress' | 'complete' | 'error'

export interface EtatLecture {
  nbExigences: number
  /** `processing_status` du projet : « analyzing » tant qu'une lecture tourne, « error » après un échec du run. */
  statutTraitement: string | null | undefined
  /** Phase du flux de progression (SSE) : « pending » tant que le serveur ne signale aucun traitement. */
  phaseFlux: PhaseFlux
  /** Le projet vient d'être relu auprès du serveur (pas de lancement en train de se confirmer). */
  donneesAJour: boolean
}

// Statuts qui ne désignent aucun traitement de lecture en cours.
const STATUTS_AU_REPOS = new Set(['', 'ready'])

export function lectureNonDemarree(e: EtatLecture): boolean {
  if (!e.donneesAJour) return false
  if (e.nbExigences > 0) return false
  if (!STATUTS_AU_REPOS.has(e.statutTraitement ?? '')) return false
  return e.phaseFlux === 'pending'
}

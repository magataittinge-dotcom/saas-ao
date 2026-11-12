import type { Project } from '@/types'

/**
 * Le dossier a-t-il été lu ? Même critère que l'écran Pièces, dont la checklist « apparaîtra une fois le DCE analysé » : tant
 * que la lecture n'a pas eu lieu, Plan et Rédiger n'ont rien de réel à montrer (G9, recette du 4/11). Le serveur numérote 3
 * l'étape Décider : le dossier est lu si l'analyse vient de finir (statut « analyzed », la décision reste à prendre), si l'étape 3
 * est cochée (« On y va ») ou si le projet est passé à l'étape 4 ou plus.
 */
export function dossierLu(p: Pick<Project, 'current_step' | 'completed_steps'> & Partial<Pick<Project, 'status'>>): boolean {
  return p.completed_steps?.['3'] === true || p.current_step >= 4 || p.status === 'analyzed'
}

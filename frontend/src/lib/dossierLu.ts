import type { Project } from '@/types'

/**
 * Le dossier a-t-il été lu (étape « Décider » faite) ? Même critère que l'écran Pièces, dont la checklist « apparaîtra une
 * fois le DCE analysé » : tant que la lecture n'a pas eu lieu, Plan et Rédiger n'ont rien de réel à montrer (G9, recette du
 * 4/11). Le serveur numérote 3 l'analyse : elle est faite si l'étape 3 est cochée ou si le projet est passé à l'étape 4 ou plus.
 */
export function dossierLu(p: Pick<Project, 'current_step' | 'completed_steps'>): boolean {
  return p.completed_steps?.['3'] === true || p.current_step >= 4
}

import { useMemo } from 'react'
import { useProjects } from '@/hooks/useProject'
import { echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'
import { niveauUrgence } from '@/lib/mesAO'

/** AO en cours dont l'échéance est aujourd'hui ou sous 7 jours (même calcul que tous les écrans, 1.14). */
export function useUrgents(): number {
  const { data: projects = [] } = useProjects()
  return useMemo(() => projects.filter((p) => {
    if (!estEnCours(p.status)) return false
    const etat = etatEcheance(echeanceAO(p)).etat
    return etat === 'aujourdhui' || etat === 'proche'
  }).length, [projects])
}

/** Le ton de la pastille de « Mes AO » : rouge si une remise tombe sous 3 jours (ou aujourd'hui), ambre sinon (COULEURS.md). */
export function useTonUrgence(): 'rouge' | 'ambre' {
  const { data: projects = [] } = useProjects()
  return useMemo(() => (niveauUrgence(projects) === 'rouge' ? 'rouge' : 'ambre'), [projects])
}

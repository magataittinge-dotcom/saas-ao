import { useMemo } from 'react'
import { useProjects } from '@/hooks/useProject'
import { echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'

/** AO en cours dont l'échéance est aujourd'hui ou sous 7 jours (même calcul que tous les écrans, 1.14). */
export function useUrgents(): number {
  const { data: projects = [] } = useProjects()
  return useMemo(() => projects.filter((p) => {
    if (!estEnCours(p.status)) return false
    const etat = etatEcheance(echeanceAO(p)).etat
    return etat === 'aujourdhui' || etat === 'proche'
  }).length, [projects])
}

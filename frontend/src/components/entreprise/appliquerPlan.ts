import { api } from '@/services/api'
import type { Plan } from '@/lib/entreprise/liste'

/** Applique un plan d'enregistrement : créations, puis modifications, puis suppressions (une requête par ligne touchée). */
export async function appliquerPlan<T>(chemin: string, plan: Plan<T>, corpsCreation: (c: Partial<T>) => Record<string, unknown> = (c) => c as Record<string, unknown>): Promise<void> {
  for (const c of plan.crees) await api.post(chemin, corpsCreation(c))
  for (const m of plan.modifies) await api.patch(`${chemin}/${m.id}`, m.changements)
  for (const id of plan.supprimes) await api.delete(`${chemin}/${id}`)
}

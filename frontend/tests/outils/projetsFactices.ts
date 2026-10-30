// Projets INVENTÉS pour les tests de « Synorix Intelligence » (aucun texte de DCE client).
import type { Project } from '@/types'

/** Vendredi 23 octobre 2026, 9 h (heure locale). */
export const MAINTENANT = new Date(2026, 9, 23, 9, 0, 0)

export function projet(id: string, over: Partial<Project> = {}): Project {
  return {
    id, organization_id: 'org-test', name: `AO ${id}`, status: 'en_cours', current_step: 1,
    created_at: '2026-10-01T09:00:00', updated_at: '2026-10-20T09:00:00', ...over,
  }
}

/** Remise le `date` (AAAA-MM-JJ) à 12 h. */
export const remise = (date: string) => ({ echeance: { date, heure: '12h00' } })

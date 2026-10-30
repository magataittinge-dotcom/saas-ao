// Données INVENTÉES pour la page de démonstration interne /intelligence-demo et les tests.
// Aucun texte de DCE client : noms, acheteurs et lots sont fictifs.
import type { DashboardStats, Project } from '@/types'

/** Vendredi 23 octobre 2026, 9 h : le jour fixé des maquettes, pour des captures reproductibles. */
export const MAINTENANT_DEMO = new Date(2026, 9, 23, 9, 0, 0)

const base = { organization_id: 'org-demo', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-20T09:00:00' }

export const PROJETS_DEMO: Project[] = [
  {
    ...base, id: 'demo-1', name: 'Bardage du gymnase Jean-Jaurès', status: 'en_cours', current_step: 6,
    maitre_ouvrage: 'Commune de Saint-Brice-les-Prés', selected_lot_name: 'Lot 2 — Bardage',
    echeance: { date: '2026-10-28', heure: '12h00' },
  },
  {
    ...base, id: 'demo-2', name: 'Ravalement de la résidence Les Tilleuls', status: 'en_cours', current_step: 5,
    maitre_ouvrage: 'Logivesle Habitat', selected_lot_name: 'Lot unique',
    echeance: { date: '2026-11-06', heure: '12h00' },
  },
  {
    ...base, id: 'demo-3', name: 'Réhabilitation thermique du groupe scolaire Paul-Bert', status: 'analyzed', current_step: 3,
    maitre_ouvrage: 'Ville de Bellerive-sur-Vesle', selected_lot_name: 'Lot 03 — Isolation thermique par l’extérieur',
    echeance: { date: '2026-11-13', heure: '12h00' },
  },
  {
    ...base, id: 'demo-4', name: 'Isolation des combles de la mairie annexe', status: 'en_cours', current_step: 2,
    maitre_ouvrage: 'Ville de Bellerive-sur-Vesle',
    lots_detectes: [{ id: '1', nom: 'Lot 1' }, { id: '2', nom: 'Lot 2' }, { id: '3', nom: 'Lot 3' }, { id: '4', nom: 'Lot 4' }] as never,
    echeance: { date: '2026-11-20', heure: '12h00' },
  },
]

export const STATS_DEMO: DashboardStats = {
  projects_en_cours: 4, projects_soumis_ce_mois: 2, projects_gagnes: 5, taux_succes: 36,
  documents_expires: 1, documents_expirant_bientot: 2,
}

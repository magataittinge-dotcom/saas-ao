// Charge utile du POST /projects/:id/memoire/generate : une seule fonction, pour que l'écran de préparation
// puisse changer d'ordre sans jamais changer ce qui part au serveur (couvert par memoire-ecran.test.tsx).
import type { PreflightSelection } from '@/components/project/MemoirePreflight'

export interface VariablesMemoire {
  nb_ouvriers: string
  delai: string
  chef_chantier_nom: string
  chef_chantier_qualification: string
  conducteur_travaux_nom: string
  conducteur_travaux_qualification: string
  materiel_specifique: string
  particularites: string
}

export const VARIABLES_VIDES: VariablesMemoire = {
  nb_ouvriers: '',
  delai: '',
  chef_chantier_nom: '',
  chef_chantier_qualification: '',
  conducteur_travaux_nom: '',
  conducteur_travaux_qualification: '',
  materiel_specifique: '',
  particularites: '',
}

export function corpsGeneration(variables: VariablesMemoire, preflight: PreflightSelection) {
  return {
    nb_ouvriers: variables.nb_ouvriers ? parseInt(variables.nb_ouvriers) : undefined,
    delai: variables.delai || undefined,
    chef_chantier_nom: variables.chef_chantier_nom || undefined,
    chef_chantier_qualification: variables.chef_chantier_qualification || undefined,
    conducteur_travaux_nom: variables.conducteur_travaux_nom || undefined,
    conducteur_travaux_qualification: variables.conducteur_travaux_qualification || undefined,
    materiel_specifique: variables.materiel_specifique || undefined,
    particularites: variables.particularites || undefined,
    profile_overrides: preflight.profile_overrides || undefined,
    reference_ids: preflight.reference_ids || undefined,
    update_profile: preflight.update_profile || undefined,
    include_organigramme: preflight.include_organigramme || undefined,
    gantt_phases: preflight.gantt_phases || undefined,
    annexe_document_ids: preflight.annexe_document_ids || undefined,
  }
}

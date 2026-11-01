// Mon entreprise — ce qu'un formulaire de rubrique lit et envoie. Chaque rubrique écrit dans les tables actuelles
// par les routes existantes (PATCH /organizations/me, PUT /memoire-config) : aucune donnée ne change de place.
import type { CAEntry, MemoireConfig, Organization, PosteCle } from '@/types'
import type { DonneesEntreprise, RubriqueId } from './avancement'

/** Champs de l'organisation écrits par chaque rubrique. */
export const CHAMPS_ORGANISATION: Record<RubriqueId, (keyof Organization)[]> = {
  identite: ['name', 'address', 'presentation'],
  moyens: [],
  certifications: [],
}

/** Champs du profil (memoire_config) écrits par chaque rubrique. `nom_entreprise` n'y figure plus : le nom vient de l'organisation. */
export const CHAMPS_PROFIL: Record<RubriqueId, (keyof MemoireConfig)[]> = {
  identite: ['date_creation', 'gerant_nom', 'gerant_titre', 'zone_intervention', 'historique', 'activites', 'chiffre_affaires'],
  moyens: [
    'organigramme_description', 'postes_cles', 'moyens_informatiques', 'vehicules', 'materiel',
    'demarche_qualite', 'procedure_demarrage', 'gestion_securite', 'traitement_dechets', 'mesures_environnementales',
    'fournisseurs_principaux',
  ],
  certifications: [],
}

export const CA_VIDE = (): CAEntry[] => [{ annee: '', montant: '' }, { annee: '', montant: '' }, { annee: '', montant: '' }]
export const POSTES_PAR_DEFAUT = (): PosteCle[] => [
  { poste: 'Directeur Travaux', nom: '', role: '' },
  { poste: 'Conducteur Travaux', nom: '', role: '' },
  { poste: 'Chef de Chantier', nom: '', role: '' },
  { poste: 'Administration', nom: '', role: '' },
]

export interface Brouillon {
  organisation: Partial<Organization>
  profil: Partial<MemoireConfig>
}

/** Copie de travail d'une rubrique, lue dans les données chargées. */
export function brouillonDepuis(rubrique: RubriqueId, d: DonneesEntreprise): Brouillon {
  const organisation: Record<string, unknown> = {}
  for (const k of CHAMPS_ORGANISATION[rubrique]) organisation[k] = d.organisation?.[k] ?? ''
  const profil: Record<string, unknown> = {}
  for (const k of CHAMPS_PROFIL[rubrique]) profil[k] = d.profil?.[k] ?? (k === 'chiffre_affaires' ? CA_VIDE() : k === 'postes_cles' ? POSTES_PAR_DEFAUT() : '')
  return { organisation: organisation as Partial<Organization>, profil: profil as Partial<MemoireConfig> }
}

export interface ChargeUtile {
  /** Corps de PATCH /organizations/me, ou null si la rubrique n'y écrit rien. */
  organisation: Record<string, unknown> | null
  /** Corps de PUT /memoire-config, ou null. */
  profil: Record<string, unknown> | null
}

/**
 * Corps des deux requêtes. Le nom de l'entreprise est unique à l'écran (celui de l'organisation) : si le profil
 * garde une surcharge `nom_entreprise` (lue par le générateur de mémoire), elle suit le nom saisi.
 */
export function chargeUtile(rubrique: RubriqueId, b: Brouillon, d: DonneesEntreprise): ChargeUtile {
  const orgCles = CHAMPS_ORGANISATION[rubrique]
  const profilCles = CHAMPS_PROFIL[rubrique]
  const organisation: Record<string, unknown> = {}
  for (const k of orgCles) {
    const v = b.organisation[k]
    if (k === 'name' && !(typeof v === 'string' && v.trim())) continue // une entreprise garde un nom
    organisation[k] = v ?? ''
  }
  const profil: Record<string, unknown> = {}
  for (const k of profilCles) profil[k] = b.profil[k] ?? ''
  const nom = typeof b.organisation.name === 'string' ? b.organisation.name.trim() : ''
  if (rubrique === 'identite' && nom && d.profil?.nom_entreprise && d.profil.nom_entreprise !== nom) profil.nom_entreprise = nom
  return {
    organisation: orgCles.length ? organisation : null,
    profil: profilCles.length || 'nom_entreprise' in profil ? profil : null,
  }
}

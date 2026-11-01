// Mon entreprise — ce qu'un formulaire de rubrique lit et envoie. Chaque rubrique écrit dans les tables actuelles
// par les routes existantes (PATCH /organizations/me, PUT /memoire-config) : aucune donnée ne change de place.
import type { CAEntry, LigneEffectif, LigneHabilitation, LigneMoyen, MemoireConfig, Organization, PosteCle } from '@/types'
import type { DonneesEntreprise, RubriqueId } from './avancement'

/** Champs de l'organisation écrits par chaque rubrique. */
export const CHAMPS_ORGANISATION: Record<RubriqueId, (keyof Organization)[]> = {
  identite: ['name', 'address', 'presentation', 'forme_juridique', 'capital_social', 'greffe_rcs', 'email_contact', 'telephone'],
  moyens: [],
  certifications: [],
}

/** Champs du profil (memoire_config) écrits par chaque rubrique. `nom_entreprise` n'y figure plus : le nom vient de l'organisation. */
export const CHAMPS_PROFIL: Record<RubriqueId, (keyof MemoireConfig)[]> = {
  identite: ['date_creation', 'gerant_nom', 'gerant_titre', 'zone_intervention', 'historique', 'activites', 'metiers', 'departements_intervention'],
  moyens: [
    'organigramme_description', 'postes_cles', 'moyens_informatiques', 'vehicules', 'materiel',
    'demarche_qualite', 'procedure_demarrage', 'gestion_securite', 'traitement_dechets', 'mesures_environnementales',
    'fournisseurs_principaux',
    'effectifs_par_categorie', 'habilitations', 'materiel_liste', 'vehicules_liste',
    'sous_traitance_partenaires', 'sous_traitance_part_pct', 'sav_garantie',
  ],
  certifications: ['chiffre_affaires'],
}

/** Champs ajoutés par la migration 0029 : listes (vides par défaut) et nombres. Ils ne partent que renseignés ou déjà présents. */
export const CHAMPS_LISTES: (keyof MemoireConfig)[] = ['metiers', 'departements_intervention', 'effectifs_par_categorie', 'habilitations', 'materiel_liste', 'vehicules_liste']
export const CHAMPS_NOMBRES: (keyof MemoireConfig)[] = ['sous_traitance_part_pct']
const CHAMPS_NEUFS: (keyof MemoireConfig)[] = [...CHAMPS_LISTES, ...CHAMPS_NOMBRES, 'sous_traitance_partenaires', 'sav_garantie']
const NOMBRES_ORGANISATION: (keyof Organization)[] = ['capital_social']
const ORGANISATION_NEUVE: (keyof Organization)[] = ['forme_juridique', 'capital_social', 'greffe_rcs', 'email_contact', 'telephone']

const renseigne = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)

/**
 * Nettoyage des listes avant envoi : une ligne laissée vide n'est pas envoyée, une spécialité vide devient null,
 * un doublon (même catégorie et même spécialité, même type d'habilitation) ne garde que la première ligne.
 */
export function nettoyerListes(profil: Record<string, unknown>): Record<string, unknown> {
  const sortie = { ...profil }
  for (const k of ['materiel_liste', 'vehicules_liste']) {
    if (Array.isArray(sortie[k])) sortie[k] = (sortie[k] as LigneMoyen[]).filter((l) => typeof l?.designation === 'string' && l.designation.trim()).map((l) => ({ ...l, designation: l.designation.trim() }))
  }
  if (Array.isArray(sortie.effectifs_par_categorie)) {
    const vus = new Set<string>()
    sortie.effectifs_par_categorie = (sortie.effectifs_par_categorie as LigneEffectif[])
      .map((l) => ({ ...l, specialite: (l.specialite ?? '').trim() || null }))
      .filter((l) => { const cle = `${l.categorie}|${(l.specialite ?? '').toLowerCase()}`; if (vus.has(cle)) return false; vus.add(cle); return true })
  }
  if (Array.isArray(sortie.habilitations)) {
    const vus = new Set<string>()
    sortie.habilitations = (sortie.habilitations as LigneHabilitation[])
      .filter((l) => l.type !== 'autre' || (l.libelle ?? '').trim())
      .map((l) => ({ ...l, libelle: l.type === 'autre' ? (l.libelle ?? '').trim() : null, valide_jusqu: l.valide_jusqu || null }))
      .filter((l) => { const cle = `${l.type}|${l.type === 'autre' ? (l.libelle ?? '').toLowerCase() : ''}`; if (vus.has(cle)) return false; vus.add(cle); return true })
  }
  return sortie
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
  for (const k of CHAMPS_PROFIL[rubrique]) {
    profil[k] = d.profil?.[k] ?? (k === 'chiffre_affaires' ? CA_VIDE() : k === 'postes_cles' ? POSTES_PAR_DEFAUT() : CHAMPS_LISTES.includes(k) ? [] : CHAMPS_NOMBRES.includes(k) ? null : '')
  }
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
    if (ORGANISATION_NEUVE.includes(k) && !renseigne(v) && !renseigne(d.organisation?.[k])) continue // champs de la migration 0029 : seulement renseignés ou déjà présents
    if (NOMBRES_ORGANISATION.includes(k)) {
      const n = typeof v === 'number' ? v : Number(v)
      if (v !== '' && v !== null && v !== undefined && Number.isFinite(n)) organisation[k] = n
      else organisation[k] = null // vidé à l'écran alors qu'il était renseigné : null efface (PATCH exclude_unset)
      continue
    }
    organisation[k] = v ?? ''
  }
  const profil: Record<string, unknown> = {}
  for (const k of profilCles) {
    const v = b.profil[k]
    // Les champs de la migration 0029 ne partent que s'ils sont renseignés ou s'ils l'étaient déjà (pour pouvoir les vider).
    if (CHAMPS_NEUFS.includes(k) && !renseigne(v) && !renseigne(d.profil?.[k])) continue
    profil[k] = CHAMPS_NOMBRES.includes(k) ? (renseigne(v) ? Number(v) : null) : (v ?? '')
  }
  const nom = typeof b.organisation.name === 'string' ? b.organisation.name.trim() : ''
  if (rubrique === 'identite' && nom && d.profil?.nom_entreprise && d.profil.nom_entreprise !== nom) profil.nom_entreprise = nom
  return {
    organisation: orgCles.length ? organisation : null,
    profil: profilCles.length || 'nom_entreprise' in profil ? nettoyerListes(profil) : null,
  }
}

// Veille des appels d'offres : les appels du contrat (/api/veille). Voir .claude/echange/sprint-ozcan/veille/CONTRAT-API.md.
import { api } from '@/services/api'
import { paramsAvis, paramsFiltres, type FiltresAvis, type TriAvis, type VilleZone } from '@/lib/veille'

export type Metier = string   // codes du serveur (GET /metiers donne la liste et les libellés)
export type Procedure = 'adaptee' | 'ouvert' | 'restreint' | 'negociee' | 'dialogue' | 'autre'

export interface PreferencesVeille {
  departements: string[]
  ville: VilleZone | null
  filtres: FiltresAvis
  tri: TriAvis
  derniere_visite: string | null
}

/** Ce que PUT /preferences accepte : tout sauf la dernière visite. */
export type PreferencesAEnvoyer = Partial<Omit<PreferencesVeille, 'derniere_visite'>>

export interface AvisVeille {
  id: string
  id_boamp: string
  objet: string
  acheteur: string
  departements: string[]
  date_parution: string
  date_limite: string | null
  procedure: Procedure
  procedure_libelle: string
  famille: string | null
  metiers: Metier[]
  url_avis: string
  url_dossier: string | null
  nouveau: boolean
}

export interface ComptesVeille {
  comptes: Record<string, number>
  total: number
  actualise_le: string | null
  source: string
}

export interface PageAvis {
  items: AvisVeille[]
  curseur_suivant: string | null
  total: number
}

export const PREFERENCES_PAR_DEFAUT: PreferencesVeille = {
  departements: [],
  ville: null,
  filtres: { metiers: [], delai_jours: null, procedures: [], mots_cles: '' },
  tri: 'date_limite',
  derniere_visite: null,
}

export const SOURCE_VEILLE = 'BOAMP – DILA, licence ouverte'

export async function lirePreferences(): Promise<PreferencesVeille> {
  const { data } = await api.get<PreferencesVeille>('/veille/preferences')
  return data
}

export async function enregistrerPreferences(corps: PreferencesAEnvoyer): Promise<PreferencesVeille> {
  const { data } = await api.put<PreferencesVeille>('/veille/preferences', corps)
  return data
}

export async function poserVisite(): Promise<{ derniere_visite: string }> {
  const { data } = await api.post<{ derniere_visite: string }>('/veille/visite')
  return data
}

export async function lireMetiers(): Promise<{ code: Metier; libelle: string }[]> {
  const { data } = await api.get<{ metiers: { code: Metier; libelle: string }[] }>('/veille/metiers')
  return data.metiers
}

export async function lireComptes(filtres: FiltresAvis, signal?: AbortSignal): Promise<ComptesVeille> {
  const { data } = await api.get<ComptesVeille>('/veille/comptes', { params: paramsFiltres(filtres), signal })
  return data
}

export async function lireAvis(
  departements: readonly string[], filtres: FiltresAvis, tri: TriAvis, curseur: string | null, signal?: AbortSignal,
): Promise<PageAvis> {
  const { data } = await api.get<PageAvis>('/veille/avis', { params: paramsAvis(departements, filtres, tri, curseur), signal })
  return data
}

export async function creerAODepuisAvis(idAvis: string): Promise<string> {
  const { data } = await api.post<{ project_id: string }>(`/veille/avis/${encodeURIComponent(idAvis)}/creer-ao`)
  return data.project_id
}

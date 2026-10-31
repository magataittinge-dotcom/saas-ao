// Veille des appels d'offres : calculs de zone, sans React ni réseau.
//   - résolution d'un résultat de l'API Adresse (api-adresse.data.gouv.fr) en ville + département ;
//   - recherche locale d'un département par nom ou par code ;
//   - rayon autour d'une ville (haversine) → liste de départements, à partir de leurs centroïdes ;
//   - recherche différée (300 ms) qui abandonne la requête précédente.
import { DEPARTEMENTS } from '@/components/veille/donnees/departements'

export interface PointGeo { lat: number; lon: number }
export interface DepartementPoint extends PointGeo { code: string; nom?: string }

/** Ville choisie, telle que le serveur la garde (contrat : Preferences.ville). */
export interface VilleZone {
  libelle: string
  code_insee: string
  code_postal: string
  departement: string
  lat: number
  lon: number
  rayon_km: number | null
}

/** Les rayons proposés (0 = le département de la ville seulement). */
export const RAYONS_KM = [0, 25, 50, 100] as const

const RAYON_TERRE_KM = 6371

/** Distance à vol d'oiseau entre deux points (formule de haversine), en kilomètres. */
export function distanceKm(a: PointGeo, b: PointGeo): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Départements dont le centroïde est à `rayonKm` au plus du centre, du plus proche au plus éloigné.
 * Le département de la ville (`departement`) en fait toujours partie, quel que soit le rayon.
 */
export function departementsDansLeRayon(
  centre: PointGeo,
  rayonKm: number,
  departement: string | null,
  points: readonly DepartementPoint[] = DEPARTEMENTS,
): string[] {
  const dedans = points
    .map((p) => ({ code: p.code, d: distanceKm(centre, p) }))
    .filter((p) => p.d <= rayonKm || p.code === departement)
    .sort((a, b) => (a.code === departement ? -1 : b.code === departement ? 1 : a.d - b.d))
    .map((p) => p.code)
  return dedans
}

/** Les départements d'une ville et de son rayon : ce que l'écran envoie au serveur. */
export function departementsDeLaVille(ville: VilleZone, points: readonly DepartementPoint[] = DEPARTEMENTS): string[] {
  return departementsDansLeRayon(ville, ville.rayon_km ?? 0, ville.departement, points)
}

// ── API Adresse ──────────────────────────────────────────────────────────────────────────────
export interface FeatureAdresse {
  properties?: { label?: string; name?: string; postcode?: string; citycode?: string; context?: string; city?: string }
  geometry?: { coordinates?: [number, number] }
}

/** « 69, Rhône, Auvergne-Rhône-Alpes » → { code: '69', nom: 'Rhône' } ; null si le code est inconnu de la carte. */
export function departementDepuisContexte(
  contexte: string | undefined,
  connus: readonly { code: string }[] = DEPARTEMENTS,
): { code: string; nom: string } | null {
  if (!contexte) return null
  const [code, nom] = contexte.split(',').map((s) => s.trim())
  if (!code || !connus.some((d) => d.code === code.toUpperCase())) return null
  return { code: code.toUpperCase(), nom: nom ?? '' }
}

/** Un résultat de l'API Adresse → la ville gardée dans les préférences (rayon à 0 km). Null si le résultat est inexploitable. */
export function villeDepuisAdresse(f: FeatureAdresse, rayonKm: number | null = 0): VilleZone | null {
  const p = f.properties
  const c = f.geometry?.coordinates
  if (!p || !c || c.length < 2) return null
  const dep = departementDepuisContexte(p.context)
  if (!dep) return null
  const [lon, lat] = c
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    libelle: p.label || p.name || p.city || '',
    code_insee: p.citycode ?? '',
    code_postal: p.postcode ?? '',
    departement: dep.code,
    lat,
    lon,
    rayon_km: rayonKm,
  }
}

/** Texte de l'adresse envoyé à l'API : espaces superflus retirés. */
export const nettoyerRequete = (q: string) => q.trim().replace(/\s+/g, ' ')

// ── Recherche locale d'un département ────────────────────────────────────────────────────────
const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface DepartementCherche { code: string; nom: string }

/** Départements dont le nom commence par la saisie ou la contient, ou dont le code correspond. 6 au plus. */
export function chercherDepartements(
  saisie: string,
  departements: readonly DepartementCherche[] = DEPARTEMENTS,
  limite = 6,
): DepartementCherche[] {
  const q = normaliser(saisie)
  if (q.length === 0) return []
  const note = (d: DepartementCherche): number | null => {
    const code = d.code.toLowerCase()
    const nom = normaliser(d.nom)
    if (code === q) return 0
    if (nom === q) return 0
    if (nom.startsWith(q)) return 1
    if (nom.split(' ').some((m) => m.startsWith(q))) return 2
    if (/^[0-9][0-9ab]?[0-9]?$/.test(q) && code.startsWith(q)) return 3
    if (q.length >= 3 && nom.includes(q)) return 4
    return null
  }
  return departements
    .map((d) => ({ d, n: note(d) }))
    .filter((x): x is { d: DepartementCherche; n: number } => x.n !== null)
    .sort((a, b) => a.n - b.n || a.d.nom.localeCompare(b.d.nom, 'fr'))
    .slice(0, limite)
    .map((x) => x.d)
}

/** Une saisie qui n'est qu'un numéro de département (1 à 3 caractères) ne part pas à l'API. */
export const estSaisieDeCode = (q: string) => /^\d{1,3}$|^2[abAB]$/.test(q.trim())

// ── Recherche différée ───────────────────────────────────────────────────────────────────────
export const DELAI_RECHERCHE_MS = 300

export interface RechercheDifferee<T> {
  /** Planifie la recherche ; une nouvelle demande annule la précédente (minuterie et requête en cours). */
  demander: (q: string, surResultat: (r: T) => void, surErreur?: (e: unknown) => void) => void
  annuler: () => void
}

/**
 * Débounce + abandon : seule la dernière saisie est cherchée, au bout de `delai` ms ;
 * la requête déjà partie pour une saisie périmée est interrompue (AbortSignal) et son résultat ignoré.
 */
export function rechercheDifferee<T>(
  chercher: (q: string, signal: AbortSignal) => Promise<T>,
  delai = DELAI_RECHERCHE_MS,
): RechercheDifferee<T> {
  let minuterie: ReturnType<typeof setTimeout> | null = null
  let controleur: AbortController | null = null
  const annuler = () => {
    if (minuterie) clearTimeout(minuterie)
    minuterie = null
    controleur?.abort()
    controleur = null
  }
  return {
    annuler,
    demander(q, surResultat, surErreur) {
      annuler()
      minuterie = setTimeout(() => {
        minuterie = null
        const c = new AbortController()
        controleur = c
        chercher(q, c.signal).then(
          (r) => { if (!c.signal.aborted) surResultat(r) },
          (e) => { if (!c.signal.aborted) surErreur?.(e) },
        )
      }, delai)
    },
  }
}

// ── Préférences, requêtes et visites (contrat /api/veille) ────────────────────────────────────
export type FiltresAvis = {
  metiers: string[]
  delai_jours: 7 | 15 | 30 | null
  procedures: string[]
  mots_cles: string
}
export type TriAvis = 'date_limite' | 'date_parution'

export const FILTRES_PAR_DEFAUT: FiltresAvis = { metiers: [], delai_jours: null, procedures: [], mots_cles: '' }

/** Vrai quand un filtre au moins est posé (la zone n'est pas un filtre). */
export const aDesFiltres = (f: FiltresAvis) =>
  f.metiers.length > 0 || f.procedures.length > 0 || f.delai_jours !== null || f.mots_cles.trim() !== ''

/** Paramètres de requête communs à /comptes et /avis : les listes sont séparées par des virgules, les valeurs vides omises. */
export function paramsFiltres(f: FiltresAvis): Record<string, string | number> {
  const p: Record<string, string | number> = {}
  if (f.metiers.length) p.metiers = f.metiers.join(',')
  if (f.procedures.length) p.procedures = f.procedures.join(',')
  if (f.delai_jours !== null) p.delai_jours = f.delai_jours
  const q = f.mots_cles.trim()
  if (q) p.q = q
  return p
}

/** Paramètres de /avis : la zone est obligatoire (une zone vide donne une réponse vide, jamais d'appel inutile). */
export function paramsAvis(
  departements: readonly string[], f: FiltresAvis, tri: TriAvis, curseur: string | null, limite = 20,
): Record<string, string | number> {
  const p: Record<string, string | number> = { ...paramsFiltres(f), departements: departements.join(','), tri, limite }
  if (curseur) p.curseur = curseur
  return p
}

/** La visite se pose à la sortie de l'accueil si la dernière date de plus de 24 h (ou n'existe pas). */
export const DELAI_VISITE_MS = 24 * 3600 * 1000
export function doitPoserVisite(derniereVisite: string | null, maintenant: Date = new Date()): boolean {
  if (!derniereVisite) return true
  const t = Date.parse(derniereVisite)
  if (!Number.isFinite(t)) return true
  return maintenant.getTime() - t > DELAI_VISITE_MS
}

/** Départements voisins proches de la zone, à proposer quand elle ne donne rien : les plus proches d'abord, hors zone. */
export function departementsVoisins(
  selection: readonly string[],
  points: readonly DepartementPoint[] = DEPARTEMENTS,
  max = 6,
  rayonKm = 130,
): string[] {
  const choisis = points.filter((p) => selection.includes(p.code))
  if (choisis.length === 0) return []
  return points
    .filter((p) => !selection.includes(p.code))
    .map((p) => ({ code: p.code, d: Math.min(...choisis.map((c) => distanceKm(c, p))) }))
    .filter((p) => p.d <= rayonKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((p) => p.code)
}

/** Sauvegarde différée (500 ms) : la dernière valeur seule part ; `vider` l'envoie tout de suite (sortie de l'écran). */
export const DELAI_SAUVEGARDE_MS = 500
export interface SauvegardeDifferee<T> {
  planifier: (valeur: T) => void
  /** Envoie sans attendre ce qui est en attente. */
  vider: () => void
  annuler: () => void
}
export function sauvegardeDifferee<T>(envoyer: (v: T) => void, delai = DELAI_SAUVEGARDE_MS): SauvegardeDifferee<T> {
  let minuterie: ReturnType<typeof setTimeout> | null = null
  let attente: { v: T } | null = null
  const annuler = () => { if (minuterie) clearTimeout(minuterie); minuterie = null; attente = null }
  const vider = () => {
    if (minuterie) clearTimeout(minuterie)
    minuterie = null
    const a = attente
    attente = null
    if (a) envoyer(a.v)
  }
  return {
    annuler, vider,
    planifier(v) {
      if (minuterie) clearTimeout(minuterie)
      attente = { v }
      minuterie = setTimeout(vider, delai)
    },
  }
}

/** « Élargir » : d'abord retirer les filtres ; sans filtre à retirer, ajouter les départements voisins ; sinon rien. */
export type EtapeElargir = { type: 'filtres' } | { type: 'voisins'; ajout: string[] } | null
export function etapeElargir(filtres: FiltresAvis, selection: readonly string[], points: readonly DepartementPoint[] = DEPARTEMENTS): EtapeElargir {
  if (aDesFiltres(filtres)) return { type: 'filtres' }
  const ajout = departementsVoisins(selection, points)
  return ajout.length ? { type: 'voisins', ajout } : null
}

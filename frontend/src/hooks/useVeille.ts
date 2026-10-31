// État de la veille : préférences (zone, filtres, tri) chargées à l'arrivée et enregistrées à chaque changement
// (500 ms de débounce, envoi immédiat à la sortie), comptes de la carte, avis par curseur, création d'un AO,
// visite posée à la sortie de l'accueil si la dernière date de plus de 24 h.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  creerAODepuisAvis, enregistrerPreferences, lireAvis, lireComptes, lireMetiers, lirePreferences, poserVisite,
  PREFERENCES_PAR_DEFAUT, type AvisVeille, type PreferencesAEnvoyer, type PreferencesVeille,
} from '@/services/veille'
import {
  FILTRES_PAR_DEFAUT, doitPoserVisite, etapeElargir, sauvegardeDifferee,
  type FiltresAvis, type TriAvis, type VilleZone,
} from '@/lib/veille'

export const CLES_VEILLE = {
  preferences: ['veille', 'preferences'] as const,
  metiers: ['veille', 'metiers'] as const,
  comptes: (f: FiltresAvis) => ['veille', 'comptes', f] as const,
  avis: (d: readonly string[], f: FiltresAvis, tri: TriAvis) => ['veille', 'avis', [...d].sort(), f, tri] as const,
}

export interface ZoneVeille { selection: string[]; ville: VilleZone | null }

export function useVeille() {
  const qc = useQueryClient()

  // ── Préférences : lues une fois à l'arrivée, puis l'état local fait foi ──
  const prefs = useQuery({ queryKey: CLES_VEILLE.preferences, queryFn: lirePreferences, staleTime: Infinity, refetchOnWindowFocus: false })
  // Retour sur l'accueil : les préférences déjà en mémoire servent tout de suite (pas de carte vide qui clignote).
  const enMemoire = qc.getQueryData<PreferencesVeille>(CLES_VEILLE.preferences)
  const [zone, setZoneEtat] = useState<ZoneVeille>(() => ({ selection: enMemoire?.departements ?? [], ville: enMemoire?.ville ?? null }))
  const [filtres, setFiltresEtat] = useState<FiltresAvis>(() => enMemoire?.filtres ?? FILTRES_PAR_DEFAUT)
  const [tri, setTriEtat] = useState<TriAvis>(() => enMemoire?.tri ?? 'date_limite')
  const [hydrate, setHydrate] = useState(!!enMemoire)
  const derniereEnvoyee = useRef<string>(enMemoire ? JSON.stringify(corps(enMemoire.departements, enMemoire.ville, enMemoire.filtres, enMemoire.tri)) : '')

  useEffect(() => {
    if (hydrate || !prefs.data) return
    const p = prefs.data
    setZoneEtat({ selection: p.departements, ville: p.ville })
    setFiltresEtat(p.filtres)
    setTriEtat(p.tri)
    derniereEnvoyee.current = JSON.stringify(corps(p.departements, p.ville, p.filtres, p.tri))
    setHydrate(true)
  }, [prefs.data, hydrate])

  // Sans réponse du serveur (erreur), l'écran reste utilisable avec les valeurs par défaut.
  useEffect(() => { if (prefs.isError && !hydrate) setHydrate(true) }, [prefs.isError, hydrate])

  const envoyer = useMemo(() => sauvegardeDifferee((c: PreferencesAEnvoyer) => {
    const cle = JSON.stringify(c)
    if (cle === derniereEnvoyee.current) return
    derniereEnvoyee.current = cle
    enregistrerPreferences(c).then((r) => qc.setQueryData<PreferencesVeille>(CLES_VEILLE.preferences, (anc) => ({ ...(anc ?? PREFERENCES_PAR_DEFAUT), ...r })))
      .catch(() => { derniereEnvoyee.current = '' })
  }), [qc])

  useEffect(() => {
    if (!hydrate) return
    envoyer.planifier(corps(zone.selection, zone.ville, filtres, tri))
  }, [hydrate, zone, filtres, tri, envoyer])
  // À la sortie : ce qui attend part tout de suite.
  useEffect(() => () => envoyer.vider(), [envoyer])

  const setZone = useCallback((z: ZoneVeille) => setZoneEtat(z), [])
  const setFiltres = useCallback((p: Partial<FiltresAvis>) => setFiltresEtat((f) => ({ ...f, ...p })), [])
  const setTri = useCallback((t: TriAvis) => setTriEtat(t), [])

  // ── Visite : à la sortie de l'accueil, si la dernière date de plus de 24 h ──
  const derniereVisite = useRef<string | null>(null)
  derniereVisite.current = prefs.data?.derniere_visite ?? null
  const chargee = useRef(false)
  chargee.current = !!prefs.data
  useEffect(() => () => {
    if (!chargee.current || !doitPoserVisite(derniereVisite.current)) return
    poserVisite().then((r) => qc.setQueryData<PreferencesVeille>(CLES_VEILLE.preferences, (anc) => ({ ...(anc ?? PREFERENCES_PAR_DEFAUT), derniere_visite: r.derniere_visite }))).catch(() => {})
  }, [qc])

  // ── Données ──
  const metiers = useQuery({ queryKey: CLES_VEILLE.metiers, queryFn: lireMetiers, staleTime: 3600_000, refetchOnWindowFocus: false })
  const comptes = useQuery({
    queryKey: CLES_VEILLE.comptes(filtres),
    queryFn: ({ signal }) => lireComptes(filtres, signal),
    enabled: hydrate,
    staleTime: 60_000,
    placeholderData: (prec) => prec,
  })
  const avisQuery = useInfiniteQuery({
    queryKey: CLES_VEILLE.avis(zone.selection, filtres, tri),
    queryFn: ({ pageParam, signal }) => lireAvis(zone.selection, filtres, tri, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (derniere) => derniere.curseur_suivant,
    enabled: hydrate && zone.selection.length > 0,
    staleTime: 60_000,
  })
  const avis: AvisVeille[] = useMemo(() => avisQuery.data?.pages.flatMap((p) => p.items) ?? [], [avisQuery.data])
  const total = avisQuery.data?.pages[0]?.total ?? 0

  const creer = useMutation({
    mutationFn: (idAvis: string) => creerAODepuisAvis(idAvis),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['dashboard-stats'] }) },
  })

  /** « Élargir » : d'abord retirer les filtres ; sans filtre à retirer, ajouter les départements voisins. */
  const elargir = useCallback(() => {
    const etape = etapeElargir(filtres, zone.selection)
    if (etape?.type === 'filtres') setFiltresEtat(FILTRES_PAR_DEFAUT)
    else if (etape?.type === 'voisins') setZoneEtat({ selection: [...zone.selection, ...etape.ajout].slice(0, 30), ville: null })
  }, [filtres, zone.selection])

  return {
    chargeEnCours: !hydrate,
    zone, setZone, filtres, setFiltres, tri, setTri,
    metiers: metiers.data ?? [],
    comptes: comptes.data?.comptes ?? {},
    totalComptes: comptes.data?.total ?? 0,
    actualiseLe: comptes.data?.actualise_le ?? null,
    source: comptes.data?.source ?? null,
    comptesEnErreur: comptes.isError,
    avis, total,
    avisEnCours: avisQuery.isFetching && !avisQuery.isFetchingNextPage,
    avisEnErreur: avisQuery.isError,
    aPlus: !!avisQuery.hasNextPage,
    voirPlus: () => { if (avisQuery.hasNextPage && !avisQuery.isFetchingNextPage) void avisQuery.fetchNextPage() },
    chargePlus: avisQuery.isFetchingNextPage,
    creerAO: creer.mutateAsync,
    creationEnCours: creer.isPending ? (creer.variables ?? null) : null,
    /** Identifiant de l'avis dont la dernière création n'a pas abouti. */
    creationEnErreurPour: creer.isError ? (creer.variables ?? null) : null,
    elargir,
  }
}

function corps(departements: string[], ville: VilleZone | null, filtres: FiltresAvis, tri: TriAvis): PreferencesAEnvoyer {
  return { departements, ville, filtres, tri }
}

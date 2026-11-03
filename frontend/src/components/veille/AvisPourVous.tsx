// Mes AO sans AO : jusqu'à trois avis de la veille, pour la zone et les filtres enregistrés. Chargé à la demande par l'écran
// vide de Mes AO (React.lazy) : les données de la veille ne pèsent que là où on les montre.
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ExternalLink, MapPin } from 'lucide-react'
import { lireAvis, lireMetiers, lirePreferences, creerAODepuisAvis, type AvisVeille } from '@/services/veille'
import { CLES_VEILLE } from '@/hooks/useVeille'
import { jourCourt } from '@/lib/mesAO'
import { urlSure } from '@/lib/veille'
import { Pastille } from '@/components/mesao/Etat'

/** Jusqu'à trois avis de la veille pour la zone et les filtres enregistrés de l'utilisateur ; rien sans zone. */
function useAvisPourVous() {
  const prefs = useQuery({ queryKey: CLES_VEILLE.preferences, queryFn: lirePreferences, staleTime: 5 * 60_000, refetchOnWindowFocus: false })
  const p = prefs.data
  const zone = p?.departements ?? []
  const avis = useQuery({
    queryKey: ['mes-ao', 'avis-pour-vous', [...zone].sort(), p?.filtres, p?.tri],
    queryFn: ({ signal }) => lireAvis(zone, p!.filtres, p!.tri, null, signal),
    enabled: !!p && zone.length > 0,
    staleTime: 60_000,
  })
  const metiers = useQuery({ queryKey: CLES_VEILLE.metiers, queryFn: lireMetiers, staleTime: 3600_000, refetchOnWindowFocus: false })
  const libelles: Record<string, string> = Object.fromEntries((metiers.data ?? []).map((m) => [m.code, m.libelle]))
  return { avis: (avis.data?.items ?? []).slice(0, 3), libelles, zoneChoisie: zone.length > 0, charge: prefs.isLoading || avis.isLoading }
}

function CarteAvisVeille({ avis, libelles }: { avis: AvisVeille; libelles: Record<string, string> }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const creer = useMutation({
    mutationFn: () => creerAODepuisAvis(avis.id),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${id}`)
    },
  })
  const lien = urlSure(avis.url_avis)
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-carte border border-bord-2 bg-surface-0 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {avis.nouveau && <Pastille ton="turquoise" icone={MapPin}>Nouveau</Pastille>}
        {avis.metiers[0] && libelles[avis.metiers[0]] && <Pastille ton="gris">{libelles[avis.metiers[0]]}</Pastille>}
      </div>
      <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-fg">{avis.objet}</h3>
      <p className="text-[13px] text-fg-2">{avis.acheteur}</p>
      {avis.date_limite && <p className="text-[13px] text-fg-2">Remise le <strong className="font-semibold text-fg">{jourCourt(new Date(avis.date_limite))}</strong></p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
        <button type="button" disabled={creer.isPending} onClick={() => creer.mutate()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-bleu-soft px-3.5 text-[13.5px] font-semibold text-bleu-ink hover:ring-1 hover:ring-bleu-mark disabled:opacity-60 max-sm:w-full">
          Préparer cet AO<ArrowRight size={15} aria-hidden />
        </button>
        {lien && (
          <a href={lien} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-accent-text hover:underline">
            Voir l’avis<ExternalLink size={12} aria-hidden /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
          </a>
        )}
      </div>
      {creer.isError && <p role="alert" className="text-[13px] text-rouge-ink">La création n’a pas abouti. Réessayez.</p>}
    </article>
  )
}

export default function AvisPourVous() {
  const { avis, libelles, zoneChoisie, charge } = useAvisPourVous()
  return avis.length > 0 ? (
    <div className="grid gap-4 md:grid-cols-3">{avis.map((a) => <CarteAvisVeille key={a.id} avis={a} libelles={libelles} />)}</div>
  ) : (
    <p className="rounded-carte border border-bord-2 bg-surface-1 px-5 py-4 text-sm text-fg-2">
      {charge ? 'Recherche des avis…' : zoneChoisie ? 'Aucun avis ouvert pour votre zone en ce moment.' : 'Choisissez votre zone sur la carte de l’accueil : les avis ouverts près de chez vous apparaîtront ici.'}
    </p>
  )
}

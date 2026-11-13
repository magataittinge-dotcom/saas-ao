// Mes AO sans AO : jusqu'à trois avis de la veille, pour la zone et les filtres enregistrés. Chargé à la demande par l'écran
// vide de Mes AO (React.lazy) : les données de la veille ne pèsent que là où on les montre.
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import { lireAvis, lireMetiers, lirePreferences, creerAODepuisAvis, type AvisVeille } from '@/services/veille'
import { CLES_VEILLE } from '@/hooks/useVeille'
import { jourCourt } from '@/lib/mesAO'
import { urlSure } from '@/lib/veille'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { PastilleEtat } from '@/components/ui/pastille'
import { EtatErreur } from '@/components/ui/etats'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'

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
  // Une lecture en panne n'est jamais « aucun avis » ni « choisissez votre zone » (F-03).
  const enErreur = (prefs.isError && !prefs.data) || (avis.isError && !avis.data)
  const relancer = () => { if (prefs.isError) void prefs.refetch(); if (avis.isError) void avis.refetch() }
  return { avis: (avis.data?.items ?? []).slice(0, 3), libelles, zoneChoisie: zone.length > 0, charge: prefs.isLoading || avis.isLoading, enErreur, relancer }
}

/** Un avis : une rangée (objet, acheteur et métier ; remise et compte à rebours ; les deux gestes), les mêmes mots que sur l'Accueil. */
function RangeeAvisVeille({ avis, libelles }: { avis: AvisVeille; libelles: Record<string, string> }) {
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
  const metier = avis.metiers[0] ? libelles[avis.metiers[0]] : undefined
  return (
    <li data-avis={avis.id} className="grid min-w-0 gap-x-6 gap-y-3 border-t border-bord px-5 py-4 first:border-t-0 sm:px-6 lg:col-span-3 lg:grid-cols-subgrid lg:items-center">
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-fg">{avis.objet}</h3>
        {/* le métier : du texte (jury, tour 3 : une pastille grise dit un état, pas un métier) */}
        <p className="mt-0.5 text-sm text-fg-2">{[avis.acheteur, metier].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        {avis.nouveau && <PastilleEtat sens="turquoise" icone={Sparkles}>Nouveau</PastilleEtat>}
        {avis.date_limite && (
          <>
            <DeadlinePill echeance={{ date: avis.date_limite }} />
            <span className="whitespace-nowrap text-sm text-fg-2">Remise le {jourCourt(new Date(avis.date_limite))}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:justify-end">
        <Bouton enCours={creer.isPending} libelleEnCours="Création…" onClick={() => creer.mutate()} className="max-sm:w-full">
          Préparer cet AO<ArrowRight aria-hidden strokeWidth={1.75} />
        </Bouton>
        {lien && (
          <a href={lien} target="_blank" rel="noopener noreferrer" className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>
            Voir l’avis<ExternalLink aria-hidden strokeWidth={1.75} /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
          </a>
        )}
        {creer.isError && <p role="alert" className="basis-full text-sm text-rouge-ink">La création n’a pas abouti. Réessayez.</p>}
      </div>
    </li>
  )
}

export default function AvisPourVous() {
  const { avis, libelles, zoneChoisie, charge, enErreur, relancer } = useAvisPourVous()
  if (avis.length === 0 && enErreur) return <EtatErreur titre="Les avis de la veille n’ont pas pu se charger" onReessayer={relancer} />
  return avis.length > 0 ? (
    // une seule surface, une rangée par avis (jury, tour 3 : une carte seule dans une grille prévue pour trois)
    <Carte sansMarge>
      <ul className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto]">{avis.map((a) => <RangeeAvisVeille key={a.id} avis={a} libelles={libelles} />)}</ul>
    </Carte>
  ) : (
    <p className="rounded-carte border border-bord bg-surface-0 px-5 py-4 text-sm text-fg-2">
      {charge ? 'Recherche des avis…' : zoneChoisie ? 'Aucun avis ouvert pour votre zone en ce moment.' : 'Choisissez votre zone sur la carte de l’accueil : les avis ouverts près de chez vous apparaîtront ici.'}
    </p>
  )
}

import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import BandeAO from '@/components/dashboard/BandeAO'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { api } from '@/services/api'
import { echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'
import { cn } from '@/lib/utils'
import type { Project, DashboardStats } from '@/types'

/* ── Empty fallback ──────────────────────────────────────────────── */
const EMPTY_STATS: DashboardStats = {
  projects_en_cours: 0,
  projects_soumis_ce_mois: 0,
  projects_gagnes: 0,
  taux_succes: 0,
  documents_expires: 0,
  documents_expirant_bientot: 0,
}

// Cible tactile : 44 px de haut sur écran tactile (contrôles de la phase C)
const cible = 'inline-flex items-center [@media(pointer:coarse)]:min-h-11'

// La carte, la liste et leurs données : un morceau à part, demandé par l'accueil seulement.
const VeilleAccueil = lazy(() => import('@/components/veille/VeilleAccueil'))

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/* ── Dates : « jeudi 23 octobre », « 27/10 · 12 h », « mardi à 9 h 30 » ── */
function dateDuJour(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (c) => c.toUpperCase())
}

/* ═══════════════════════════════════════════════════════════════════
   TABLEAU DE BORD — jetons du système (clair et nuit)
   la bande « Vos AO en cours » (trois au plus, la prochaine action), puis la veille
   des appels d'offres (carte de France et liste des avis, chargées à la demande),
   puis le coffre-fort et le bilan. « Synorix Intelligence » vit en haut de Mes AO.
   Pas de cartes héros ni d'accès rapides : la navigation est dans la barre latérale. Aucune couleur écrite ici :
   tout passe par les jetons (styles/theme.css) et les composants de base.
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, organization } = useAuthStore()

  const { data: projects = [], isLoading: pLoad } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => { const { data } = await api.get<Project[]>('/projects'); return data },
  })
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get<DashboardStats>('/dashboard/stats'); return data },
  })

  const queryClient = useQueryClient()
  // 1.13 — « Sans suite » se défait : l'AO classé peut être rouvert d'un clic
  const [classe, setClasse] = useState<{ id: string; name: string } | null>(null)
  const { mutate: markSansSuite } = useMutation({
    mutationFn: async (p: { id: string; name: string }) => {
      await api.patch(`/projects/${p.id}`, { status: 'sans_suite' })
    },
    onSuccess: (_, p) => {
      setClasse(p)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
  const { mutate: reouvrir, isPending: reouverture } = useMutation({
    mutationFn: async (p: { id: string; name: string }) => {
      await api.patch(`/projects/${p.id}`, { status: 'analyzed' })
    },
    onSuccess: () => {
      setClasse(null)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  // C15 — quota pour l'écran « premier DCE offert » + rappel sobre de l'offre
  const { data: quotaStatus } = useQuery<{
    plan: string
    analyses: { used: number; limit: number | null }
    memoires: { used: number; limit: number | null }
  }>({
    queryKey: ['billing-quota'],
    queryFn: async () => { const { data } = await api.get('/billing/quota'); return data },
  })

  const s = stats ?? EMPTY_STATS
  const firstName = user?.name?.split(' ')[0] ?? 'vous'

  // 1.14 — « en cours » : la définition commune (lib/echeance.ts, comme le serveur).
  // Les AO clos (soumis/gagné/perdu/sans_suite) sortent du tableau de bord.
  const activeProjects = projects.filter((p) => estEnCours(p.status))
  const avecEcheance = activeProjects.map((p) => ({ ...p, _echeance: etatEcheance(echeanceAO(p)) }))
  // La liste : la remise la plus proche d'abord, les AO sans date à la fin.
  const liste = [...avecEcheance].sort((a, b) =>
    (a._echeance.limite?.getTime() ?? Infinity) - (b._echeance.limite?.getTime() ?? Infinity))
  // Prochaines dates : les remises à venir, même calcul partout (1.14)
  const aVenir = liste.filter((p) => p._echeance.etat === 'aujourdhui' || p._echeance.etat === 'proche' || p._echeance.etat === 'a_venir')
  const upcoming = aVenir.filter((p) => p._echeance.etat !== 'a_venir')

  // Note du Compagnon — positive, basée sur les vrais compteurs
  const next = upcoming[0]
  // Pas de « marge » annoncée quand une date de remise est déjà passée (1.14).
  const datePassee = activeProjects.find((p) => etatEcheance(echeanceAO(p)).etat === 'passee')
  // « Dossier prêt » seulement si l'étape Export est atteinte — 1.14.
  const synorixNote = activeProjects.length === 0
    ? "Créez votre premier appel d'offres : l'IA analyse le dossier de l'acheteur, prépare la candidature et rédige le mémoire technique."
    : `${activeProjects.length} appel${activeProjects.length > 1 ? 's' : ''} d'offres en cours.` +
      (next
        ? next._echeance.etat === 'aujourdhui'
          ? next.current_step >= 6
            ? ` Échéance aujourd'hui : « ${next.name} » — votre dossier est prêt.`
            : ` Échéance aujourd'hui : « ${next.name} ».`
          : ` Prochaine échéance dans ${next._echeance.jours} jour${next._echeance.jours! > 1 ? 's' : ''} : « ${next.name} ».`
        : datePassee
          ? ` La date de remise de « ${datePassee.name} » est passée.`
          : ' Aucune échéance imminente, vous avez de la marge.')

  const prochaine = aVenir[0]?._echeance
  const resume = [
    dateDuJour(new Date()),
    `${activeProjects.length} AO en cours`,
    prochaine && (prochaine.etat === 'aujourdhui' ? "remise aujourd'hui" : `prochaine remise dans ${pluriel(prochaine.jours!, 'jour')}`),
  ].filter(Boolean).join(' · ')

  // C15 — essai intact (free, trial accordé, 0 unité, 0 projet) → écran
  // central « premier DCE offert » ; essai consommé → tableau de bord normal.
  const freshTrial =
    organization?.plan === 'free'
    && organization?.trial_granted !== false
    && quotaStatus !== undefined
    && quotaStatus.analyses.used === 0
    && quotaStatus.memoires.used === 0
    && !pLoad && projects.length === 0

  if (freshTrial) {
    return <FirstAOWelcome />
  }

  const consumedFreeTrial =
    organization?.plan === 'free'
    && quotaStatus !== undefined
    && (quotaStatus.analyses.used > 0 || quotaStatus.memoires.used > 0
        || organization?.trial_granted === false)

  const decides = s.projects_gagnes > 0 || s.taux_succes > 0

  return (
    <div className="mx-auto w-full max-w-[1680px] px-1 pb-4 pt-2 sm:px-4 lg:px-6 xl:px-8">

      {/* C15 — essai utilisé : rappel sobre de l'offre, jamais bloquant */}
      {consumedFreeTrial && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-bord py-3">
          <p className="text-[15px] text-fg-2">
            Votre AO d'essai est utilisé. Le plan Pro couvre 40 analyses et 40 mémoires par mois.
          </p>
          <button
            onClick={() => navigate('/settings/billing')}
            className={cn(cible, 'shrink-0 text-sm font-medium text-accent-text underline-offset-[3px] transition-colors duration-base ease-lien hover:underline')}
          >
            Voir les plans
          </button>
        </div>
      )}

      {/* ── En-tête : bonjour, la journée en une ligne, la note du jour ── */}
      <header>
        <h1 className="font-display text-h5 text-fg">Bonjour, {firstName}</h1>
        <p className="mt-1 text-[15px] text-fg-3">{resume}</p>
        <p className="mt-4 max-w-[72ch] text-[15px] leading-6 text-fg-2">{synorixNote}</p>
      </header>

      {/* ── Vos AO en cours : trois au plus, la remise et la prochaine action ── */}
      <div className="mt-8">
        <BandeAO
          projets={projects}
          total={activeProjects.length}
          chargement={pLoad}
          onSansSuite={markSansSuite}
          onNouveau={() => navigate('/projects/new')}
        />
      </div>

      {/* ── La veille : la carte et la liste des avis, chargées à la demande (l'accueil seulement) ── */}
      <div className="mt-12">
        <Suspense fallback={<VeilleEnChargement />}>
          <VeilleAccueil />
        </Suspense>
      </div>

      {/* ── Coffre-fort et bilan, en une ligne chacun ── */}
      <div className="mt-12 grid gap-x-14 gap-y-8 border-t border-bord pt-6 md:grid-cols-2">
        <section aria-labelledby="t-coffre">
          <h2 id="t-coffre" className="text-base font-semibold text-fg">Coffre-fort</h2>
          {s.documents_expires === 0 && s.documents_expirant_bientot === 0 ? (
            <p className="pt-2 text-[15px] text-fg-3">Aucune pièce à renouveler.</p>
          ) : (
            <ul className="pt-1">
              {s.documents_expires > 0 && (
                <li>
                  <Link to="/vault" className={cn(cible, 'gap-2.5 py-2 text-[15px] text-fg transition-colors duration-base ease-lien hover:text-accent-text')}>
                    <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                    {pluriel(s.documents_expires, 'pièce')} à renouveler
                  </Link>
                </li>
              )}
              {s.documents_expirant_bientot > 0 && (
                <li>
                  <Link to="/vault" className={cn(cible, 'gap-2.5 py-2 text-[15px] text-fg transition-colors duration-base ease-lien hover:text-accent-text')}>
                    <span className="size-2 shrink-0 rounded-full border border-warning" aria-hidden />
                    {s.documents_expirant_bientot > 1
                      ? `${s.documents_expirant_bientot} pièces expirent bientôt`
                      : '1 pièce expire bientôt'}
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>

        <section aria-labelledby="t-bilan">
          <h2 id="t-bilan" className="text-base font-semibold text-fg">Bilan</h2>
          <dl className="pt-1 text-[15px]">
            <div className="flex items-baseline justify-between py-1.5">
              <dt className="text-fg-3">Soumis ce mois-ci</dt>
              <dd className="font-medium tabular-nums text-fg">{s.projects_soumis_ce_mois}</dd>
            </div>
            <div className="flex items-baseline justify-between py-1.5">
              <dt className="text-fg-3">AO gagnés</dt>
              <dd className="font-medium tabular-nums text-fg">{s.projects_gagnes}</dd>
            </div>
            {decides && (
              <div className="flex items-baseline justify-between py-1.5">
                <dt className="text-fg-3">Taux de réussite</dt>
                <dd className="font-medium tabular-nums text-fg">{s.taux_succes} %</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {classe && createPortal(
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-bord bg-surface-pop px-4 py-3 text-sm shadow-toast"
        >
          <p className="flex-1 text-fg">« {classe.name} » est classé sans suite.</p>
          <button
            onClick={() => reouvrir(classe)}
            disabled={reouverture}
            className={cn(cible, 'shrink-0 rounded-md border border-input px-2.5 text-[13px] font-semibold text-fg transition-colors duration-base ease-lien hover:bg-surface-2 disabled:opacity-60')}
          >
            Annuler
          </button>
          <button
            onClick={() => setClasse(null)}
            aria-label="Fermer le message"
            className={cn(cible, 'shrink-0 justify-center rounded-md px-2 text-base leading-none text-fg-3 transition-colors duration-base ease-lien hover:text-fg')}
          >
            ×
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ── Attente de la veille : la place de la carte est réservée, la page ne saute pas ── */
function VeilleEnChargement() {
  return (
    <section aria-label="Chargement de la veille des appels d'offres" className="min-h-[34rem]">
      <div className="border-b border-bord pb-3"><span className="block h-5 w-56 animate-pulse rounded bg-surface-2" /></div>
      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <span className="block h-96 animate-pulse rounded-lg bg-surface-1" />
        <span className="block h-96 animate-pulse rounded-lg bg-surface-1" />
      </div>
    </section>
  )
}

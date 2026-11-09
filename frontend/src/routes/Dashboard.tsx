import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, CircleAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import BandeAO from '@/components/dashboard/BandeAO'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { api } from '@/services/api'
import { echeanceAO, estEnCoursOuvert, etatEcheance } from '@/lib/echeance'
import { prenomAffichable } from '@/lib/prenom'
import { raisonSociale } from '@/lib/raisonSociale'
import { dateDuJourParis } from '@/lib/dateParis'
import { avancement } from '@/lib/entreprise/avancement'
import { useDocuments } from '@/hooks/useDocuments'
import { VisageRond } from '@/components/mesao/VisagePetit'
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
  const prenom = prenomAffichable(user?.name, user?.email)

  // 1.14 — « en cours » : la définition commune (lib/echeance.ts, comme le serveur).
  // Les AO clos (soumis/gagné/perdu/sans_suite) sortent du tableau de bord.
  const activeProjects = projects.filter((p) => estEnCoursOuvert(p))
  const avecEcheance = activeProjects.map((p) => ({ ...p, _echeance: etatEcheance(echeanceAO(p)) }))
  // La liste : la remise la plus proche d'abord, les AO sans date à la fin.
  const liste = [...avecEcheance].sort((a, b) =>
    (a._echeance.limite?.getTime() ?? Infinity) - (b._echeance.limite?.getTime() ?? Infinity))
  // Prochaines dates : les remises à venir, même calcul partout (1.14)
  const aVenir = liste.filter((p) => p._echeance.etat === 'aujourdhui' || p._echeance.etat === 'proche' || p._echeance.etat === 'a_venir')
  const upcoming = aVenir.filter((p) => p._echeance.etat !== 'a_venir')

  // La ligne du jour (heure de Paris) : la date, le nombre d'AO en cours et la prochaine remise. Une seule fois chaque
  // information : sans AO en cours, la bande le dit (et liste les remises passées) ; la ligne s'en tient à la date.
  // « Dossier prêt » seulement si l'étape Export est atteinte — 1.14.
  const next = upcoming[0]
  const prochaine = aVenir[0]?._echeance
  const suite = next && next._echeance.etat === 'aujourdhui'
    ? (next.current_step >= 6 ? "remise aujourd'hui, dossier prêt" : "remise aujourd'hui")
    : prochaine && prochaine.etat !== 'a_venir' ? `prochaine remise dans ${pluriel(prochaine.jours!, 'jour')}` : null
  const enCours = activeProjects.length > 0 ? `${activeProjects.length} AO en cours` : null
  const raison = raisonSociale(organization)
  const identite = avancement({ organisation: organization }, 'identite')
  const profilRenseigne = identite.total > 0 && identite.rempli >= identite.total
  const { data: documents } = useDocuments()
  const nbDocuments = documents?.length ?? 0

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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-carte border border-bord bg-surface-0 px-5 py-3">
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

      {/* ── En-tête : bonjour (le h1 serif), la journée en une ligne, le fil d'aurore ; à droite, l'entreprise et son visage ── */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <h1 className="titre-page text-fg">{prenom ? `Bonjour, ${prenom}` : 'Bonjour'}</h1>
          <p className="mt-2 text-[15px] text-fg-2">
            {dateDuJourParis()}
            {enCours && <> · <strong className="chiffres font-semibold text-fg">{enCours}</strong></>}
            {suite && <>, {suite}</>}
          </p>
          <span aria-hidden className="fil-aurore mt-4 block" />
        </div>
        <Link to="/company" data-pastille-entreprise
          className="flex min-w-0 max-w-full items-center gap-3 rounded-pilule border border-bord bg-surface-0 py-2 pl-2.5 pr-5 shadow-card transition-[border-color] duration-base ease-survol hover:border-bord-2">
          <VisageRond taille={48} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-fg">{raison}</span>
            <span className={cn('mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold', profilRenseigne ? 'text-vert-ink' : 'text-ambre-ink')}>
              {profilRenseigne ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <CircleAlert size={13} strokeWidth={2.2} aria-hidden />}
              {profilRenseigne ? 'Profil renseigné' : 'Profil à compléter'}
            </span>
          </span>
        </Link>
      </header>

      {/* ── Vos AO en cours : trois au plus, la remise et la prochaine action ; les remises passées en dessous ── */}
      <div className="mt-10">
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

      {/* ── Coffre-fort et bilan : une seule surface découpée par un filet (direction A) ; jamais de gros « 0 » ── */}
      <div className="mt-12 grid overflow-hidden rounded-carte border border-bord bg-surface-0 shadow-card md:grid-cols-2">
        <section aria-labelledby="t-coffre" className="flex flex-col gap-3 p-5 sm:p-6">
          <h2 id="t-coffre" className="text-lg font-semibold text-fg">Coffre-fort</h2>
          {nbDocuments > 0 ? (
            <p className="flex items-baseline gap-2"><span className="chiffre-grand">{nbDocuments}</span><span className="text-[15px] font-semibold text-fg-2">{nbDocuments > 1 ? 'documents' : 'document'}</span></p>
          ) : (
            <p className="text-[15px] text-fg-2">Vos pièces administratives apparaîtront ici, avec leur date de validité.</p>
          )}
          {s.documents_expires === 0 && s.documents_expirant_bientot === 0 ? (
            nbDocuments > 0 && <p className="flex items-center gap-2 text-[15px] font-semibold text-vert-ink"><Check size={16} strokeWidth={2.2} aria-hidden />Aucune pièce à renouveler.</p>
          ) : (
            <ul>
              {s.documents_expires > 0 && (
                <li>
                  <Link to="/vault" className={cn(cible, 'gap-2 py-1 text-[15px] font-semibold text-rouge-ink transition-colors duration-base ease-lien hover:underline')}>
                    <CircleAlert size={16} strokeWidth={2.2} aria-hidden />
                    {pluriel(s.documents_expires, 'pièce')} à renouveler
                  </Link>
                </li>
              )}
              {s.documents_expirant_bientot > 0 && (
                <li>
                  <Link to="/vault" className={cn(cible, 'gap-2 py-1 text-[15px] font-semibold text-ambre-ink transition-colors duration-base ease-lien hover:underline')}>
                    <CircleAlert size={16} strokeWidth={2.2} aria-hidden />
                    {s.documents_expirant_bientot > 1
                      ? `${s.documents_expirant_bientot} pièces expirent bientôt`
                      : '1 pièce expire bientôt'}
                  </Link>
                </li>
              )}
            </ul>
          )}
          <Link to="/vault" className={cn(cible, 'mt-auto w-fit gap-1.5 pt-2 text-sm font-semibold text-accent-text underline-offset-[3px] hover:underline')}>
            Ouvrir le coffre-fort <ArrowRight size={15} aria-hidden />
          </Link>
        </section>

        <section aria-labelledby="t-bilan" className="flex flex-col gap-3 border-t border-bord p-5 sm:p-6 md:border-l md:border-t-0">
          <h2 id="t-bilan" className="text-lg font-semibold text-fg">Bilan</h2>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-[13.5px] text-fg-3">Soumis ce mois-ci</dt>
              <dd className="mt-1">
                {s.projects_soumis_ce_mois > 0
                  ? <span className="chiffre-grand">{s.projects_soumis_ce_mois}</span>
                  : <span className="text-[15px] text-fg-2">Votre premier dossier déposé apparaîtra ici.</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[13.5px] text-fg-3">Taux de réussite</dt>
              <dd className="mt-1">
                {decides
                  ? <span className="chiffre-grand">{s.taux_succes}<span className="ml-1 text-2xl">%</span></span>
                  : <span className="text-[15px] text-fg-2">Dès votre premier résultat</span>}
              </dd>
            </div>
            {s.projects_gagnes > 0 && (
              <div>
                <dt className="text-[13.5px] text-fg-3">AO gagnés</dt>
                <dd className="chiffres mt-1 text-[15px] font-semibold text-fg">{s.projects_gagnes}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {classe && createPortal(
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-bord bg-surface-pop px-4 py-3 text-sm shadow-flottant"
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

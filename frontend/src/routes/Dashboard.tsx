import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FolderX, Plus } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import SynorixIntelligence from '@/components/intelligence/SynorixIntelligence'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { api } from '@/services/api'
import { ETAPES_AO, avancementAO, echeanceAO, estEnCours, etatEcheance, type Echeance } from '@/lib/echeance'
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

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/* ── Dates : « jeudi 23 octobre », « 27/10 · 12 h », « mardi à 9 h 30 » ── */
function dateDuJour(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (c) => c.toUpperCase())
}
function heure(d: Date) {
  return d.getMinutes() ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()} h`
}

/* ── Ce qu'il reste à faire sur un AO : un verbe, l'étape qui suit ─── */
function prochaineEtape(p: Project): string {
  if (p.status === 'analyzed' && p.current_step < 4) return 'Décider : on y va ?'
  switch (avancementAO(p.current_step).etape) {
    case 1: return 'Déposer le DCE'
    case 2: return 'Choisir le lot'
    case 3: return p.processing_status === 'processing' ? 'Analyse en cours' : "Lancer l'analyse"
    case 4: return 'Vérifier le dossier'
    case 5: return 'Rédiger le mémoire'
    default: return 'Exporter le dossier'
  }
}

/* ═══════════════════════════════════════════════════════════════════
   TABLEAU DE BORD — jetons du système (clair et nuit)
   « Synorix Intelligence » (le visage, six bulles, la prochaine action),
   puis la liste des AO en cours (que faire ensuite), les prochaines dates,
   le coffre-fort et le bilan. Pas de cartes héros ni d'accès rapides :
   la navigation est dans la barre latérale. Aucune couleur écrite ici :
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
    ? "Créez votre premier appel d'offres : l'IA analyse le DCE, prépare la candidature et rédige le mémoire technique."
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

      {/* ── Synorix Intelligence : le visage, six bulles, la prochaine action ── */}
      <div className="mt-8">
        <SynorixIntelligence projects={projects} stats={stats} prenom={firstName} />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">

        {/* ─── Les AO en cours : que faire ensuite ─────────────────── */}
        <section aria-labelledby="t-ao" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-bord pb-3">
            <h2 id="t-ao" className="text-lg font-semibold text-fg">
              Appels d'offres en cours
              {activeProjects.length > 0 && <span className="ml-2 font-normal tabular-nums text-fg-3">{activeProjects.length}</span>}
            </h2>
            {projects.length > 0 && (
              <Link to="/projects" className={cn(cible, 'gap-1 text-sm font-medium text-accent-text underline-offset-[3px] transition-colors duration-base ease-lien hover:underline')}>
                Tous mes AO <ArrowRight size={14} aria-hidden />
              </Link>
            )}
          </div>

          {pLoad ? (
            <ul aria-label="Chargement des appels d'offres">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-6 border-b border-bord py-4">
                  <span className="h-4 w-2/5 animate-pulse rounded bg-surface-2" />
                  <span className="h-4 w-24 animate-pulse rounded bg-surface-2" />
                  <span className="ml-auto h-4 w-32 animate-pulse rounded bg-surface-2" />
                </li>
              ))}
            </ul>
          ) : liste.length === 0 ? (
            <EmptyAO onCreate={() => navigate('/projects/new')} />
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[13px] text-fg-3">
                  <th scope="col" className="py-2.5 pr-6 font-medium">Appel d'offres</th>
                  <th scope="col" className="hidden py-2.5 pr-6 font-medium sm:table-cell">Remise</th>
                  <th scope="col" className="hidden py-2.5 pr-6 font-medium md:table-cell">Avancement</th>
                  <th scope="col" className="hidden py-2.5 font-medium sm:table-cell">Prochaine étape</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => {
                  const aDecider = p.status === 'analyzed' && p.current_step < 4
                  return (
                    <tr key={p.id} className="group border-t border-bord align-top [&>td]:py-4">
                      <td className="max-w-0 pr-6">
                        <Link to={`/projects/${p.id}`} className="block">
                          <span className="line-clamp-2 text-[15px] font-semibold text-fg group-hover:text-accent-text">{p.name}</span>
                          <span className="mt-0.5 block truncate text-sm text-fg-3">
                            {[p.maitre_ouvrage, p.selected_lot_name || (p.current_step <= 2 ? 'lot à choisir' : null)].filter(Boolean).join(' · ')}
                          </span>
                        </Link>
                        {/* Téléphone : la remise et l'étape suivante sous le nom */}
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:hidden">
                          <span className="tabular-nums text-fg-2">{p._echeance.etat === 'sans_date' ? 'Date à préciser' : p._echeance.libelle}</span>
                          <Link to={`/projects/${p.id}`} className={cn(cible, 'font-medium text-accent-text')}>{prochaineEtape(p)}</Link>
                        </span>
                      </td>
                      <td className="hidden w-32 whitespace-nowrap pr-6 sm:table-cell"><Remise e={p._echeance} heureConnue={!!echeanceAO(p)?.heure} /></td>
                      <td className="hidden w-40 pr-6 md:table-cell"><Avancement etape={p.current_step} /></td>
                      <td className="hidden w-48 sm:table-cell">
                        <Link
                          to={`/projects/${p.id}`}
                          className={cn(cible, 'text-sm font-medium text-accent-text underline-offset-[3px] transition-colors duration-base ease-lien hover:underline')}
                        >
                          {prochaineEtape(p)}
                        </Link>
                        {aDecider && (
                          <button
                            onClick={() => markSansSuite({ id: p.id, name: p.name })}
                            title="Classer cet AO « Analysé — sans suite » : décision prise, il quitte le tableau de bord"
                            className={cn(cible, 'mt-1 gap-1.5 text-[13px] text-fg-3 transition-colors duration-base ease-lien hover:text-fg')}
                          >
                            <FolderX size={13} strokeWidth={1.6} aria-hidden /> Sans suite
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── À côté : dates, coffre-fort, bilan ──────────────────── */}
        <aside className="space-y-10">
          <section aria-labelledby="t-dates">
            <h2 id="t-dates" className="border-b border-bord pb-3 text-lg font-semibold text-fg">Prochaines dates</h2>
            {aVenir.length === 0 ? (
              <p className="pt-4 text-[15px] text-fg-3">Aucune remise à venir.</p>
            ) : (
              <ul>
                {aVenir.slice(0, 5).map((p, i) => {
                  const d = p._echeance.limite!
                  const proche = p._echeance.etat !== 'a_venir'
                  return (
                    <li key={p.id} className="border-b border-bord last:border-b-0">
                      <Link to={`/projects/${p.id}`} className="group flex items-center gap-3.5 py-3">
                        <span className={cn(
                          'w-11 shrink-0 rounded-md border py-1 text-center leading-none',
                          i === 0 && proche ? 'border-fg' : 'border-bord',
                        )}>
                          <span className="block text-lg font-semibold tabular-nums text-fg">{String(d.getDate()).padStart(2, '0')}</span>
                          <span className="mt-0.5 block text-xs text-fg-3">{d.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium text-fg group-hover:text-accent-text">{p.name}</span>
                          <span className="block text-sm text-fg-3">
                            Remise {d.toLocaleDateString('fr-FR', { weekday: 'long' })}
                            {echeanceAO(p)?.heure ? ` à ${heure(d)}` : ''} · {p._echeance.libelle}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="t-coffre">
            <h2 id="t-coffre" className="border-b border-bord pb-3 text-lg font-semibold text-fg">Coffre-fort</h2>
            {s.documents_expires === 0 && s.documents_expirant_bientot === 0 ? (
              <p className="pt-4 text-[15px] text-fg-3">Aucune pièce à renouveler.</p>
            ) : (
              <ul className="pt-1">
                {s.documents_expires > 0 && (
                  <li>
                    <Link to="/vault" className={cn(cible, 'gap-2.5 py-2.5 text-[15px] text-fg transition-colors duration-base ease-lien hover:text-accent-text')}>
                      <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                      {pluriel(s.documents_expires, 'pièce')} à renouveler
                    </Link>
                  </li>
                )}
                {s.documents_expirant_bientot > 0 && (
                  <li>
                    <Link to="/vault" className={cn(cible, 'gap-2.5 py-2.5 text-[15px] text-fg transition-colors duration-base ease-lien hover:text-accent-text')}>
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
            <h2 id="t-bilan" className="border-b border-bord pb-3 text-lg font-semibold text-fg">Bilan</h2>
            <dl className="pt-1 text-[15px]">
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-fg-3">Soumis ce mois-ci</dt>
                <dd className="font-medium tabular-nums text-fg">{s.projects_soumis_ce_mois}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-fg-3">AO gagnés</dt>
                <dd className="font-medium tabular-nums text-fg">{s.projects_gagnes}</dd>
              </div>
              {decides && (
                <div className="flex items-baseline justify-between py-2">
                  <dt className="text-fg-3">Taux de réussite</dt>
                  <dd className="font-medium tabular-nums text-fg">{s.taux_succes} %</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
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

/* ── Remise : la date, puis le délai (J−x) ─────────────────────────── */
function Remise({ e, heureConnue }: { e: Echeance; heureConnue: boolean }) {
  if (e.etat === 'sans_date' || !e.limite) return <span className="text-sm text-fg-3">Date à préciser</span>
  const proche = e.etat === 'proche' || e.etat === 'aujourdhui'
  return (
    <>
      <span className="block text-sm font-medium tabular-nums text-fg">
        {e.limite.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
        {heureConnue && ` · ${heure(e.limite)}`}
      </span>
      <span className={cn(
        'mt-1 inline-flex h-[22px] items-center rounded px-2 text-[13px] font-medium tabular-nums',
        proche ? 'bg-warning-bg text-warning' : e.etat === 'passee' ? 'text-fg-3' : 'bg-surface-2 text-fg-2',
        e.etat === 'passee' && 'px-0',
      )}>
        {e.libelle}
      </span>
    </>
  )
}

/* ── Avancement : 6 étapes, celle en cours en bleu de Prusse ───────── */
function Avancement({ etape }: { etape: number }) {
  const a = avancementAO(etape)
  return (
    <div role="img" aria-label={a.libelle}>
      <div className="flex gap-[3px]">
        {ETAPES_AO.map((nom, i) => (
          <i
            key={nom}
            className={cn(
              'h-1 w-5 rounded-full',
              i + 1 < a.etape ? 'bg-fg' : i + 1 === a.etape ? 'bg-accent-ui' : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      <span className="mt-1.5 block text-sm text-fg-2">{a.nom}</span>
    </div>
  )
}

/* ── État vide : l'action suivante, et ce qu'elle déclenche ────────── */
function EmptyAO({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="py-10">
      <p className="text-[15px] font-semibold text-fg">Aucun appel d'offres en cours</p>
      <p className="mt-1 max-w-[60ch] text-[15px] text-fg-3">
        Déposez le DCE (ZIP ou PDF) : Synorix lit les pièces, repère les lots et prépare l'analyse.
      </p>
      <Button onClick={onCreate} className="mt-5">
        <Plus size={16} strokeWidth={2} aria-hidden /> Nouvel AO
      </Button>
    </div>
  )
}

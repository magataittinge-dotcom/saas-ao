import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import BandeAO from '@/components/dashboard/BandeAO'
import { MettreAJourStatut } from '@/components/common/MettreAJourStatut'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { Page, TitreSection } from '@/components/ui/page'
import { PastilleEtat } from '@/components/ui/pastille'
import { Squelette } from '@/components/ui/squelette'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { useDocuments } from '@/hooks/useDocuments'
import { useProjects } from '@/hooks/useProject'
import { api } from '@/services/api'
import { dateDuJourParis } from '@/lib/dateParis'
import { avancement } from '@/lib/entreprise/avancement'
import { aLaUne, comptesAO, lectureAO, type ComptesAO } from '@/lib/etatAO'
import { quandCourt } from '@/lib/mesAO'
import { quotaLibelle, trouverOffre, type Offre } from '@/lib/offres'
import { prenomAffichable } from '@/lib/prenom'
import { nomDuCompte } from '@/lib/raisonSociale'
import type { Project, DashboardStats } from '@/types'

// La carte, la liste et leurs données : un morceau à part, demandé par l'accueil seulement.
const VeilleAccueil = lazy(() => import('@/components/veille/VeilleAccueil'))

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`
const OFFRE_PRO = trouverOffre('pro') as Offre

interface Quota { plan: string; analyses: { used: number; limit: number }; memoires: { used: number; limit: number } }

/** La ligne du jour, sous le « Bonjour » : la date, puis la prochaine remise à venir (la même que « À la une » de Mes AO). */
export function suiteDuJour(projets: readonly Project[], maintenant: Date = new Date()): string | null {
  const next = aLaUne(projets, maintenant)
  if (!next) return null
  const e = lectureAO(next, maintenant).echeance
  // « dossier prêt » seulement si l'étape « Télécharger le dossier » est atteinte
  if (e.etat === 'aujourdhui') return next.current_step >= 6 ? 'remise aujourd’hui, dossier prêt' : 'remise aujourd’hui'
  if (e.etat === 'proche') return `prochaine remise dans ${pluriel(e.jours ?? 0, 'jour', 'jours')}`
  const quand = quandCourt(next)
  return quand ? `prochaine remise ${quand}` : null
}

/** Ce que Synorix dit sur l'Accueil : une phrase au plus, celle qui appelle un geste. Rien à dire : pas de visage. */
export function phraseDeSynorix(comptes: ComptesAO | null, profilRenseigne: boolean | null): { phrase: string; lien?: { to: string; libelle: string } } | null {
  if (comptes && comptes.aMettreAJour > 0) {
    return {
      phrase: comptes.aMettreAJour > 1
        ? `${comptes.aMettreAJour} appels d’offres ont dépassé leur date de remise. Dites ce qu’ils sont devenus : ils rejoindront les terminés.`
        : 'Un appel d’offres a dépassé sa date de remise. Dites ce qu’il est devenu : il rejoindra les terminés.',
    }
  }
  if (profilRenseigne === false) {
    return { phrase: 'Votre profil d’entreprise est à compléter : il nourrit chaque mémoire.', lien: { to: '/company', libelle: 'Compléter Mon entreprise' } }
  }
  return null
}

/** Le plafond du mois est atteint (toutes les offres payantes) : la phrase le dit avec ses chiffres ; sinon null. */
export function phraseQuotaAtteint(q: Quota | undefined): string | null {
  if (!q || q.plan === 'free') return null
  const plein = (u: { used: number; limit: number }) => u.used >= u.limit
  // Au-delà du nouveau quota (Pro 40 → 30, 11/11/2026) : « 30 sur 30 », comme le serveur, jamais « 35 sur 30 ».
  const lu = (u: { used: number; limit: number }) => Math.min(u.used, u.limit)
  const a = plein(q.analyses)
  const m = plein(q.memoires)
  if (a && m) return `Les unités de ce mois sont toutes utilisées : ${lu(q.analyses)} analyses sur ${q.analyses.limit}, ${lu(q.memoires)} mémoires sur ${q.memoires.limit}.`
  if (a) return `Les analyses de ce mois sont toutes utilisées : ${lu(q.analyses)} sur ${q.analyses.limit}.`
  if (m) return `Les mémoires de ce mois sont tous utilisés : ${lu(q.memoires)} sur ${q.memoires.limit}.`
  return null
}

/* ═══════════════════════════════════════════════════════════════════
   ACCUEIL — composants du système seulement (clair et nuit)
   le « Bonjour » (le seul h1) et la ligne du jour ; la ligne « Nouveau », congédiable ; ce que Synorix a à dire (une phrase) ;
   les appels d'offres en cours (trois au plus) et ceux à mettre à jour ; la veille (carte de France et liste des avis,
   chargées à la demande) ; puis le coffre-fort, l'entreprise et le bilan en une bande de cases.
   Les états d'un AO viennent de lib/etatAO.ts. Une panne du serveur dit son erreur : jamais « vous n'avez rien ».
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, organization } = useAuthStore()
  const [statutPour, setStatutPour] = useState<Project | null>(null)

  const projets = useProjects()
  const stats = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get<DashboardStats>('/dashboard/stats'); return data },
  })
  // C15 — quota pour l'écran « premier DCE offert » + rappel sobre de l'offre
  const { data: quotaStatus } = useQuery<Quota>({
    queryKey: ['billing-quota'],
    queryFn: async () => { const { data } = await api.get('/billing/quota'); return data },
  })
  const documents = useDocuments()

  const maintenant = useMemo(() => new Date(), [projets.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const comptes = useMemo(() => (projets.data ? comptesAO(projets.data, maintenant) : null), [projets.data, maintenant])
  const suite = projets.data ? suiteDuJour(projets.data, maintenant) : null
  const prenom = prenomAffichable(user?.name, user?.email)

  const identite = avancement({ organisation: organization }, 'identite')
  const profilRenseigne = organization ? identite.total > 0 && identite.rempli >= identite.total : null
  // Synorix ne parle qu'une fois les appels d'offres lus (jury, tour 1 : il parlait du profil pendant le chargement et la panne)
  const paroleDuJour = projets.data ? phraseDeSynorix(comptes, profilRenseigne) : null

  // C15 — essai intact (free, trial accordé, 0 unité, 0 projet) → écran central « premier DCE offert » ; essai consommé →
  // l'accueil normal. Le serveur doit avoir répondu : une panne n'est pas « aucun AO ».
  const freshTrial =
    organization?.plan === 'free'
    && organization?.trial_granted !== false
    && quotaStatus !== undefined
    && quotaStatus.analyses.used === 0
    && quotaStatus.memoires.used === 0
    && projets.data !== undefined && projets.data.length === 0
  if (freshTrial) return <FirstAOWelcome />

  const consumedFreeTrial =
    organization?.plan === 'free'
    && quotaStatus !== undefined
    && (quotaStatus.analyses.used > 0 || quotaStatus.memoires.used > 0 || organization?.trial_granted === false)

  const quotaAtteint = phraseQuotaAtteint(quotaStatus)
  // le plafond du mois passe avant tout : c'est Synorix qui le dit, à la place de sa phrase du jour (un seul message, pas trois)
  const parole = quotaAtteint
    ? { phrase: `${quotaAtteint} Vos appels d’offres déjà analysés restent ouverts.`, lien: { to: '/settings/billing', libelle: 'Voir l’abonnement' } }
    : paroleDuJour
  const s = stats.data
  const nbDocuments = documents.data?.length
  const aRenouveler = s ? s.documents_expires + s.documents_expirant_bientot : 0
  const decides = !!s && (s.projects_gagnes > 0 || s.taux_succes > 0)
  const suiviEnErreur = (stats.isError && !s) || (documents.isError && nbDocuments === undefined)

  return (
    <Page
      titre={prenom ? `Bonjour, ${prenom}` : 'Bonjour'}
      sousTitre={<>{dateDuJourParis()}{suite && <> · {suite}</>}<span aria-hidden className="fil-aurore mt-4 block" /></>}
    >
      {/* C15 — essai utilisé : rappel sobre de l'offre, jamais bloquant */}
      {consumedFreeTrial && (
        <Message ton="info" className="mb-6" action={<Link to="/settings/billing" className={classesBouton('lien')}>Voir les offres</Link>}>
          Votre AO d’essai est utilisé. L’offre Pro comprend {quotaLibelle(OFFRE_PRO)}.
        </Message>
      )}

      {/* Synorix parle : une phrase au plus, là où il a quelque chose à dire (le seul visage de l'écran) */}
      {parole && (
        <SynorixParle action={parole.lien ? <Link to={parole.lien.to} className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>{parole.lien.libelle}</Link> : undefined}>
          {parole.phrase}
        </SynorixParle>
      )}

      {/* ── Vos appels d'offres : en cours (trois au plus), puis ceux à mettre à jour ── */}
      <EtatRequete requete={projets} estVide={() => false} vide={null} squelette={<BandeEnChargement />}
        erreur={(
          <EtatErreur className="mt-10 max-md:mt-7.5" titre="Vos appels d’offres n’ont pas pu se charger"
            detail={'La connexion a été interrompue. Vos dossiers ne\u00a0sont\u00a0pas\u00a0touchés.'} onReessayer={() => { void projets.refetch() }} enCours={projets.isFetching} />
        )}>
        {(liste) => <BandeAO projets={liste} maintenant={maintenant} onStatut={setStatutPour} onNouveau={() => navigate('/projects/new')} />}
      </EtatRequete>

      {/* ── La veille : la carte et la liste des avis, chargées à la demande (l'accueil seulement) ── */}
      <div className="mt-10 max-md:mt-7.5">
        <Suspense fallback={<VeilleEnChargement />}>
          <VeilleAccueil />
        </Suspense>
      </div>

      {/* ── Coffre-fort, entreprise et bilan : une bande de cases ; une case n'apparaît qu'une fois sa donnée lue ── */}
      <section aria-labelledby="t-suivi" className="mt-10 max-md:mt-7.5">
        <TitreSection id="t-suivi">Votre entreprise</TitreSection>
        {suiviEnErreur ? (
          // le même modèle d'erreur que le reste de l'écran : il rejoint le « Réessayer » unique (le premier état le porte)
          <EtatErreur titre="Le coffre-fort et le bilan n’ont pas pu se charger" detail={'La connexion a été interrompue. Vos données ne\u00a0sont\u00a0pas\u00a0touchées.'}
            onReessayer={() => { void stats.refetch(); void documents.refetch() }} enCours={stats.isFetching || documents.isFetching} />
        ) : (
          // des lignes de faits, pas des cases égales (jury, tour 1) : un intitulé, ce qu'il en est, le lien pour y aller
          <Carte sansMarge>
            <dl data-faits-entreprise="" className="m-0">
              <LigneFait intitule="Coffre-fort" lien={{ to: '/vault', libelle: 'Ouvrir le coffre-fort' }}>
                {nbDocuments === undefined
                  ? <Squelette className="h-4 w-40" />
                  : nbDocuments === 0
                    ? 'Vos pièces administratives apparaîtront ici, avec leur date de validité.'
                    : <><span className="font-semibold text-fg">{pluriel(nbDocuments, 'pièce', 'pièces')}</span>{aRenouveler > 0 && <PastilleEtat sens={s && s.documents_expires > 0 ? 'rouge' : 'ambre'}>{aRenouveler} à renouveler</PastilleEtat>}</>}
              </LigneFait>
              <LigneFait intitule="Profil d’entreprise" lien={{ to: '/company', libelle: profilRenseigne === false ? 'Compléter le profil' : 'Ouvrir Mon entreprise' }}>
                {/* sans raison sociale vérifiée, pas de nom : « Mon entreprise » redirait l'intitulé */}
                {nomDuCompte(organization, null) && <span className="font-semibold text-fg">{nomDuCompte(organization, null)}</span>}
                {profilRenseigne !== null && <span className={nomDuCompte(organization, null) ? 'text-fg-2' : 'font-semibold text-fg'}>{profilRenseigne ? 'Profil renseigné' : 'Profil à compléter'}</span>}
              </LigneFait>
              {s && s.projects_soumis_ce_mois > 0 && (
                <LigneFait intitule="Déposés ce mois-ci"><span className="font-semibold text-fg">{pluriel(s.projects_soumis_ce_mois, 'dossier', 'dossiers')}</span></LigneFait>
              )}
              {decides && s && (
                <LigneFait intitule="Taux de réussite">
                  <span className="font-semibold text-fg">{s.taux_succes}{'\u00a0'}%</span>
                  {s.projects_gagnes > 0 && <span className="text-fg-2">{pluriel(s.projects_gagnes, 'marché gagné', 'marchés gagnés')}</span>}
                </LigneFait>
              )}
            </dl>
          </Carte>
        )}
      </section>

      {statutPour && <MettreAJourStatut projet={statutPour} ouvert onOuvert={(o) => { if (!o) setStatutPour(null) }} />}
    </Page>
  )
}

/** Une ligne de « Votre entreprise » : l'intitulé, le fait, le lien. Au téléphone : l'intitulé au-dessus, le lien dessous. */
function LigneFait({ intitule, lien, children }: { intitule: string; lien?: { to: string; libelle: string }; children: ReactNode }) {
  return (
    <div className="grid min-h-[60px] items-center gap-x-6 gap-y-1 border-t border-bord px-5 py-3 first:border-t-0 sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:px-6">
      <dt className="text-sm font-medium text-fg-2">{intitule}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">{children}</dd>
      {lien ? <dd className="m-0"><Link to={lien.to} className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>{lien.libelle}</Link></dd> : <span aria-hidden className="max-sm:hidden" />}
    </div>
  )
}

/* ── Attente des AO : le titre et trois lignes, à la forme des vraies lignes (nom, acheteur, date), au bureau comme au téléphone ── */
function BandeEnChargement() {
  return (
    <div className="mt-10 max-md:mt-7.5">
      <Squelette className="mb-4 h-5 w-36" />
      <Carte sansMarge>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid min-h-[77px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-t border-bord px-5 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:px-6">
            <div className="grid gap-2"><Squelette className="h-4 w-3/5 max-sm:w-4/5" /><Squelette className="h-3.5 w-2/5" /><Squelette className="h-3.5 w-1/3 sm:hidden" /></div>
            <Squelette className="h-3.5 w-32 max-sm:hidden" />
            <span aria-hidden className="size-[18px]" />
          </div>
        ))}
      </Carte>
    </div>
  )
}

/* ── Attente de la veille : le titre, la carte à gauche, des fiches d'avis à droite (les mêmes fantômes que la liste) ── */
function VeilleEnChargement() {
  return (
    <section aria-label="Chargement de la veille des appels d’offres" aria-busy="true" className="min-h-[34rem]">
      <Squelette className="h-5 w-24" />
      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="aspect-[10/11] rounded-lg border border-bord" />
        <div className="grid content-start gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2.5 rounded-lg border border-bord bg-surface-0 p-5">
              <Squelette className="h-4 w-4/5" /><Squelette className="h-3.5 w-2/5" /><Squelette className="h-3.5 w-3/5" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

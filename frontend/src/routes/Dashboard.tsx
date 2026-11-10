import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import BandeAO from '@/components/dashboard/BandeAO'
import { LigneNouveau } from '@/components/dashboard/LigneNouveau'
import { MettreAJourStatut } from '@/components/common/MettreAJourStatut'
import FirstAOWelcome from '@/components/onboarding/FirstAOWelcome'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'
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
import { prenomAffichable } from '@/lib/prenom'
import { raisonSociale } from '@/lib/raisonSociale'
import type { Project, DashboardStats } from '@/types'

// La carte, la liste et leurs données : un morceau à part, demandé par l'accueil seulement.
const VeilleAccueil = lazy(() => import('@/components/veille/VeilleAccueil'))

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

interface Quota { plan: string; analyses: { used: number; limit: number | null }; memoires: { used: number; limit: number | null } }

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
        ? `${comptes.aMettreAJour} appels d’offres ont dépassé leur date de remise. Dites ce qu’ils sont devenus : ils rejoindront les terminés.`
        : 'Un appel d’offres a dépassé sa date de remise. Dites ce qu’il est devenu : il rejoindra les terminés.',
    }
  }
  if (profilRenseigne === false) {
    return { phrase: 'Votre profil d’entreprise est à compléter : il nourrit chaque mémoire.', lien: { to: '/company', libelle: 'Compléter Mon entreprise' } }
  }
  return null
}

/** Le plafond du mois est atteint (offre à plafond seulement) : la phrase le dit avec ses chiffres ; sinon null. */
export function phraseQuotaAtteint(q: Quota | undefined): string | null {
  if (!q || q.plan === 'free') return null
  const plein = (u: { used: number; limit: number | null }) => u.limit !== null && u.used >= u.limit
  const a = plein(q.analyses)
  const m = plein(q.memoires)
  if (a && m) return `Les unités de ce mois sont toutes utilisées : ${q.analyses.used} analyses sur ${q.analyses.limit}, ${q.memoires.used} mémoires sur ${q.memoires.limit}.`
  if (a) return `Les analyses de ce mois sont toutes utilisées : ${q.analyses.used} sur ${q.analyses.limit}.`
  if (m) return `Les mémoires de ce mois sont tous utilisés : ${q.memoires.used} sur ${q.memoires.limit}.`
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
  const parole = phraseDeSynorix(comptes, profilRenseigne)

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
      {/* la ligne « Nouveau » : sous l'en-tête, congédiable ; elle n'existe plus ailleurs */}
      <LigneNouveau />

      {/* C15 — essai utilisé : rappel sobre de l'offre, jamais bloquant */}
      {consumedFreeTrial && (
        <Message ton="info" className="mb-6" action={<Link to="/settings/billing" className={classesBouton('lien')}>Voir les offres</Link>}>
          Votre AO d’essai est utilisé. Le plan Pro couvre 40 analyses et 40 mémoires par mois.
        </Message>
      )}

      {/* plafond du mois atteint : dit ici, avec ses chiffres (avant : un seul point rouge dans la barre) */}
      {quotaAtteint && (
        <Message ton="attention" className="mb-6" action={<Link to="/settings/billing" className={classesBouton('lien')}>Voir l’abonnement</Link>}>
          {quotaAtteint} Vos appels d’offres déjà lus restent ouverts.
        </Message>
      )}

      {/* Synorix parle : une phrase au plus, là où il a quelque chose à dire (le seul visage de l'écran) */}
      {parole && (
        <SynorixParle action={parole.lien ? <Link to={parole.lien.to} className={classesBouton('lien')}>{parole.lien.libelle}</Link> : undefined}>
          {parole.phrase}
        </SynorixParle>
      )}

      {/* ── Vos appels d'offres : en cours (trois au plus), puis ceux à mettre à jour ── */}
      <EtatRequete requete={projets} estVide={() => false} vide={null} squelette={<BandeEnChargement />}
        erreur={(
          <EtatErreur className="mt-10 max-md:mt-7.5" titre="Vos appels d’offres n’ont pas pu se charger"
            detail="La connexion au serveur a échoué. Vos dossiers ne sont pas touchés." onReessayer={() => { void projets.refetch() }} enCours={projets.isFetching} />
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
          <Message ton="attention" action={<Bouton onClick={() => { void stats.refetch(); void documents.refetch() }}>Réessayer</Bouton>}>
            Le coffre-fort et le bilan n’ont pas pu se charger. Vos données ne sont pas touchées.
          </Message>
        ) : (
          <BandeCases libelle="Votre entreprise">
            {nbDocuments !== undefined && (
              <CaseResume etiquette="Pièces au coffre-fort" valeur={nbDocuments} rien="Aucune"
                etat={aRenouveler > 0 ? <PastilleEtat sens={s && s.documents_expires > 0 ? 'rouge' : 'ambre'}>{aRenouveler} à renouveler</PastilleEtat> : undefined}
                precision={nbDocuments === 0 ? 'Vos pièces administratives apparaîtront ici, avec leur date de validité.' : undefined}
                action={<Link to="/vault" className={classesBouton('lien')}>Ouvrir le coffre-fort</Link>} />
            )}
            <CaseResume etiquette="Profil d’entreprise" valeur={raisonSociale(organization)}
              precision={profilRenseigne === null ? undefined : <PastilleEtat sens={profilRenseigne ? 'vert' : 'ambre'}>{profilRenseigne ? 'Profil renseigné' : 'Profil à compléter'}</PastilleEtat>}
              action={<Link to="/company" className={classesBouton('lien')}>Ouvrir Mon entreprise</Link>} />
            {s && (
              <CaseResume etiquette="Déposés ce mois-ci" valeur={s.projects_soumis_ce_mois}
                precision={s.projects_soumis_ce_mois === 0 ? 'Votre premier dossier déposé apparaîtra ici.' : undefined} />
            )}
            {decides && s && <CaseResume etiquette="Taux de réussite" valeur={`${s.taux_succes} %`} precision={s.projects_gagnes > 0 ? pluriel(s.projects_gagnes, 'marché gagné', 'marchés gagnés') : undefined} />}
          </BandeCases>
        )}
      </section>

      {statutPour && <MettreAJourStatut projet={statutPour} ouvert onOuvert={(o) => { if (!o) setStatutPour(null) }} />}
    </Page>
  )
}

/* ── Attente des AO : le titre et trois rangées, aux dimensions de la bande ── */
function BandeEnChargement() {
  return (
    <div className="mt-10 max-md:mt-7.5">
      <Squelette className="mb-4 h-5 w-64" />
      <Carte sansMarge>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-[84px] items-center gap-6 border-t border-bord px-5 first:border-t-0 sm:px-6">
            <div className="grid flex-[2] gap-2"><Squelette className="h-4 w-4/5" /><Squelette className="h-3.5 w-2/5" /></div>
            <Squelette className="h-3.5 flex-1 max-md:hidden" />
            <Squelette className="h-6 w-24 rounded-pilule max-md:hidden" />
            <Squelette className="h-11 w-44 rounded-pilule" />
          </div>
        ))}
      </Carte>
    </div>
  )
}

/* ── Attente de la veille : la place de la carte est réservée, la page ne saute pas ── */
function VeilleEnChargement() {
  return (
    <section aria-label="Chargement de la veille des appels d’offres" aria-busy="true" className="min-h-[34rem]">
      <Squelette className="h-5 w-56" />
      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Squelette className="h-96 rounded-lg" />
        <Squelette className="h-96 rounded-lg" />
      </div>
    </section>
  )
}

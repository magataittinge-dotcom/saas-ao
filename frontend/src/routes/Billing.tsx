import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import type { Organization } from '@/types'
import GrilleOffres, { PHRASE_RESILIATION } from '@/components/offres/GrilleOffres'
import { ESSAI_LIBELLE, nomPlan, prixLibelle, trouverOffre } from '@/lib/offres'
import { messageErreur } from '@/lib/erreurs'
import { allerChezStripe } from '@/lib/adresseSure'
import { jourLongParis } from '@/lib/dateParis'
import { cn } from '@/lib/utils'
import { tonConsommation, useQuota } from '@/components/layout/QuotaGauge'
import { Page, TitreSection } from '@/components/ui/page'
import { Bouton } from '@/components/ui/bouton'
import { Carte, RangeeCarte } from '@/components/ui/carte'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { ExternalLink } from 'lucide-react'
import { Message } from '@/components/ui/message'
import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import { Squelette } from '@/components/ui/squelette'

interface Compteur { used: number; limit: number }

/** L'état d'un compteur du mois : le mot, le sens (COULEURS.md : vert sous 70 %, ambre de 70 à 90 %, rouge au-delà) et la barre. */
export function lectureCompteur(c: { used: number; limit: number }): { sens: Sens; mot: string; barre: string; part: number } {
  const part = c.limit > 0 ? Math.min(1, c.used / c.limit) : 1
  // une seule couleur pour un seul état (jury, tour 3 : barres ardoise, pastille rouge, anneau rouge) : au plafond, la barre est rouge
  if (c.used >= c.limit) return { sens: 'rouge', mot: 'Tout est utilisé', barre: 'bg-rouge-mark', part }
  const ton = tonConsommation(part)
  if (ton === 'rouge') return { sens: 'rouge', mot: 'Presque atteint', barre: 'bg-rouge-mark', part }
  if (ton === 'ambre') return { sens: 'ambre', mot: 'À surveiller', barre: 'bg-ambre-mark', part }
  return { sens: 'vert', mot: 'Disponible', barre: 'bg-vert-mark', part }
}

/**
 * Une unité du mois : son nom, puis LE chiffre (ce qui est utilisé, en grand, « sur 70 » à côté) et la jauge. Tant que tout
 * va bien, rien d'autre : la pastille ne vient que hors du normal (« À surveiller », « Presque atteint »). Au plafond, la
 * rangée ne porte pas de pastille : le message de la carte le dit une fois, avec son bouton ; la barre pleine est rouge.
 */
function JaugeUnite({ libelle, compteur }: { libelle: string; compteur: Compteur }) {
  const l = lectureCompteur({ used: compteur.used, limit: compteur.limit })
  const plein = compteur.used >= compteur.limit
  // Une organisation déjà au-delà de son quota (Pro 40 → 30, 11/11/2026) lit « 30 sur 30 », comme le serveur, jamais « 35 sur 30 ».
  const utilise = Math.min(compteur.used, compteur.limit)
  return (
    <RangeeCarte className="block py-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-sm font-medium text-fg-2">{libelle}</p>
          <p data-compte-unites="" className="mt-0.5 flex items-baseline gap-1.5">
            <span className="chiffres text-xl font-semibold text-fg">{utilise}</span>
            <span className="text-sm text-fg-2">sur {compteur.limit}</span>
          </p>
        </div>
        {!plein && l.sens !== 'vert' && <PastilleEtat sens={l.sens}>{l.mot}</PastilleEtat>}
      </div>
      <div role="meter" aria-label={`${libelle} du mois`} aria-valuemin={0} aria-valuemax={compteur.limit} aria-valuenow={utilise}
        aria-valuetext={`${utilise} sur ${compteur.limit}${plein ? ', tout est utilisé' : ''}`}
        className="mt-3 h-2 overflow-hidden rounded-pilule bg-surface-2">
        <div className={cn('h-full rounded-pilule transition-[width] duration-pop ease-survol', l.barre)} style={{ width: `${l.part * 100}%` }} />
      </div>
    </RangeeCarte>
  )
}

/** « 1 décembre » → « 1er décembre » : le premier du mois s'écrit en ordinal. */
export const premierDuMois = (jour: string): string => jour.replace(/^1 /, '1er ')

/** Le jour, à l'écran : « 1er » avec son exposant (« 1ᵉʳ décembre »), les autres jours tels quels. */
function Jour({ jour }: { jour: string }) {
  return jour.startsWith('1er ') ? <>1<sup>er</sup>{jour.slice(3)}</> : <>{jour}</>
}

function SqueletteUnites() {
  return (
    <Carte className="grid gap-5">
      <Squelette className="h-10" />
      <Squelette className="h-10" />
    </Carte>
  )
}

/**
 * Abonnement : l'offre en cours et où la gérer (payer, changer d'offre, factures, résilier : le portail de paiement, dit en
 * clair), les unités du mois en jauges (vert, ambre, rouge, avec un mot), et les offres quand aucune n'est souscrite. La grille des offres, les prix et les libellés viennent de lib/offres.ts, inchangés.
 */
export default function Billing() {
  const { organization, setOrganization } = useAuthStore()
  const plan = organization?.plan ?? 'free'
  const offreActive = trouverOffre(plan)
  const isPaid = offreActive !== undefined
  const quota = useQuota()
  // Les unités du mois sont utilisées et une offre plus large existe : « Changer d'offre » est l'action de l'écran.
  const changerEnAvant = isPaid && plan !== 'business' && !!quota.data?.analyses && !!quota.data.memoires
    && [quota.data.analyses, quota.data.memoires].some((c) => c.used >= c.limit)

  const [searchParams, setSearchParams] = useSearchParams()
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPlan, setSuccessPlan] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [erreurPortail, setErreurPortail] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  // Au retour de Stripe : la session est vérifiée, puis relue jusqu'à ce que l'offre soit à jour.
  useEffect(() => {
    const isSuccess = searchParams.get('success') === 'true'
    const sessionId = searchParams.get('session_id')

    if (!isSuccess || !sessionId) return

    setSearchParams({}, { replace: true })
    setVerifying(true)
    pollCountRef.current = 0

    const verify = async () => {
      try {
        const { data } = await api.get<{ plan: string; updated: boolean }>(
          '/stripe/verify-session', { params: { session_id: sessionId } }, // P2-7 : encodé par axios
        )
        if (data.updated && data.plan !== 'free') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          setVerifying(false)
          setSuccessPlan(data.plan)
          setShowSuccess(true)
          // l'offre de l'organisation est mise à jour tout de suite (barre, jauge)
          if (organization) {
            setOrganization({ ...organization, plan: data.plan as Organization['plan'] })
          }
          void quota.refetch()   // les unités du nouveau plan (sinon celles de l'essai, « 1 sur 1 », jusqu'au rechargement)
          setTimeout(() => setShowSuccess(false), 8000)
          return
        }
      } catch { /* nouvel essai au prochain tour */ }

      pollCountRef.current++
      // 15 essais (30 s) : le paiement est passé, le webhook rattrapera
      if (pollCountRef.current >= 15) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setVerifying(false)
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 8000)
      }
    }

    verify()
    pollRef.current = setInterval(verify, 2000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // une seule fois, à l'arrivée

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    setErreur(null)
    try {
      const { data } = await api.post('/stripe/create-checkout-session', { plan: planId })
      allerChezStripe(data.url)
    } catch (e) {
      setErreur(await messageErreur(e, 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.'))
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    setErreurPortail(false)
    try {
      const { data } = await api.get('/stripe/portal')
      allerChezStripe(data.url)
    } catch {
      setErreurPortail(true)
      setPortalLoading(false)
    }
  }

  return (
    <Page titre="Abonnement" sousTitre="Votre offre, les unités du mois, et où payer, changer d’offre ou résilier." etroite={isPaid}>
      {(verifying || showSuccess || erreurPortail) && (
        <div className="mb-6 grid gap-3">
          {verifying && <Message ton="info" titre="Vérification du paiement…">La confirmation arrive dans quelques secondes.</Message>}
          {showSuccess && !verifying && (
            <Message ton="succes" titre="Paiement reçu">
              {successPlan ? `Votre offre ${nomPlan(successPlan)} est active.` : 'Votre abonnement est actif.'}
            </Message>
          )}
          {erreurPortail && (
            <Message ton="erreur" onFermer={() => setErreurPortail(false)}>
              Le portail de paiement n’a pas pu s’ouvrir. Votre abonnement n’est pas touché : réessayez dans un instant.
            </Message>
          )}
        </div>
      )}

      <Carte sansMarge className="px-5 sm:px-6">
        <RangeeCarte className="flex-wrap justify-between gap-x-6 gap-y-3 py-5">
          <div className="min-w-0">
            <p className="text-sm text-fg-2">Votre offre</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xl font-semibold text-fg">{nomPlan(plan)}</span>
              {offreActive && <span className="whitespace-nowrap text-sm text-fg-2">{prixLibelle(offreActive)} par mois HT</span>}
            </p>
            {/* Une offre souscrite : ce qu'elle donne chaque mois se lit dans « Unités du mois », juste dessous, tel que le
                serveur le compte (une seule source à l'écran : jamais deux nombres pour la même chose). */}
            {!offreActive && <p className="mt-1.5 text-sm text-fg-2">{ESSAI_LIBELLE}</p>}
          </div>
          {/* L'action de la page : le portail de paiement (aplat), sauf quand les unités sont utilisées et qu'une offre plus
              large existe : « Changer d'offre » la porte alors, et ce bouton passe au trait (un seul aplat par écran). */}
          {isPaid && (
            <Bouton variante={changerEnAvant ? 'secondaire' : 'principal'} onClick={() => { void handlePortal() }} enCours={portalLoading} libelleEnCours="Ouverture du portail…">
              Ouvrir le portail de paiement sécurisé<ExternalLink aria-hidden />
            </Bouton>
          )}
        </RangeeCarte>
        {/* Où l'on paie, où l'on change d'offre, où l'on résilie : dit une fois, en clair (le testeur cherchait « résilier »). */}
        <RangeeCarte className="py-4" data-ou-gerer="">
          {isPaid ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="font-medium text-fg">Payer, changer, factures</dt>
              <dd className="text-pretty text-fg-2">Le paiement par carte, le changement d’offre et les factures se font sur le portail de paiement sécurisé de Stripe. Il s’ouvre à la place de cette page ; un lien vous ramène ici.</dd>
              <dt className="font-medium text-fg max-sm:mt-2">Résilier</dt>
              <dd className="text-pretty text-fg-2">Vous pouvez résilier à tout moment : l’accès reste ouvert jusqu’à la fin de la période payée, et le mois entamé n’est pas remboursé.</dd>
            </dl>
          ) : (
          <p className="text-pretty text-sm text-fg-2">
            {'Vous payez par carte sur la page de paiement sécurisée de Stripe, qui s’ouvre quand vous choisissez une offre. Ensuite, vous changez d’offre, retrouvez vos factures et résiliez depuis cette page, à tout moment.'}
          </p>
          )}
        </RangeeCarte>
      </Carte>

      <TitreSection>Unités du mois</TitreSection>
      <EtatRequete
        requete={quota}
        squelette={<SqueletteUnites />}
        erreur={(
          <EtatErreur
            titre="Les unités du mois n’ont pas pu se charger"
            detail={<span className="block text-pretty">La connexion au serveur a échoué. Rien n’est modifié : votre abonnement et vos unités restent tels quels.</span>}
            onReessayer={() => { void quota.refetch() }}
            enCours={quota.isFetching}
          />
        )}
        vide={<Carte><p className="text-sm text-fg-2">Vos unités du mois apparaîtront ici dès votre première analyse.</p></Carte>}
        estVide={(q) => !q?.analyses || !q.memoires}
      >
        {(q) => {
          const atteint = [q.analyses, q.memoires].some((c) => c.used >= c.limit)
          // Business est l'offre la plus haute (11/11/2026) : pas d'offre plus large à proposer, le quota se relève sur demande.
          const business = q.plan === 'business'
          const retour = premierDuMois(jourLongParis(q.period_end))
          // Tout est utilisé : dit UNE fois (un mot, une icône, une phrase), avec le geste pour continuer.
          const plein = atteint && (
            <RangeeCarte className="flex-wrap justify-between gap-x-6 gap-y-3 py-4" data-unites-utilisees="">
              <div className="min-w-0 flex-1 basis-64">
                {/* le mot de l'état (le titre de section dit déjà « Unités du mois ») */}
                <PastilleEtat sens="rouge">Tout est utilisé</PastilleEtat>
                <p className="mt-2 text-pretty text-sm text-fg-2">
                  {retour ? <>Vos unités reviennent le <Jour jour={retour} />.</> : 'Vos unités reviennent au début de la prochaine période.'}
                  {' '}Vos dossiers en cours restent ouverts ; {business ? 'le nombre d’unités peut être relevé sur demande.' : 'avec une offre supérieure, vous continuez dès aujourd’hui.'}
                </p>
              </div>
              {/* le geste qui fait avancer : l'aplat de l'écran (abonné : le portail ; à l'essai : les offres, plus bas) */}
              {!business && (
                <Bouton variante="principal" asChild={!isPaid} onClick={isPaid ? () => { void handlePortal() } : undefined}
                  enCours={isPaid && portalLoading} libelleEnCours="Ouverture du portail…">
                  {isPaid ? 'Changer d’offre' : <a href="#offres">Voir les offres</a>}
                </Bouton>
              )}
            </RangeeCarte>
          )
          return (
            <div className="grid gap-3">
              <Carte sansMarge className="px-5 sm:px-6">
                {plein}
                <JaugeUnite libelle="Analyses" compteur={q.analyses} />
                <JaugeUnite libelle="Mémoires" compteur={q.memoires} />
              </Carte>
              {!atteint && retour && <p className="text-sm text-fg-2">Les compteurs repartent de zéro le <Jour jour={retour} />.</p>}
            </div>
          )
        }}
      </EtatRequete>

      {!isPaid && (
        <>
          <TitreSection id="offres">Choisir une offre</TitreSection>
          {erreur && <Message ton="erreur" className="mb-4" onFermer={() => setErreur(null)}>{erreur}</Message>}
          <GrilleOffres
            compacte
            action={(offre) => (
              <Bouton variante="secondaire" className="w-full" onClick={() => { void handleSubscribe(offre.id) }}
                enCours={loading === offre.id} libelleEnCours="Ouverture du paiement…">
                S’abonner
              </Bouton>
            )}
          />
          <p className="mt-4 text-xs text-fg-3">{PHRASE_RESILIATION}</p>
        </>
      )}

    </Page>
  )
}

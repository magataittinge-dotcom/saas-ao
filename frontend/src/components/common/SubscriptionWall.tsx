import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bouton } from '@/components/ui/bouton'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import { api } from '@/services/api'
import GrilleOffres, { PHRASE_RESILIATION } from '@/components/offres/GrilleOffres'
import { useAuthStore } from '@/stores/authStore'
import { estRefusSiret } from '@/lib/refus'
import { gesteOffre } from '@/lib/murOffres'
import { trouverOffre } from '@/lib/offres'

interface Props {
  open: boolean
  onClose: () => void
  feature?: 'analysis' | 'memoire'
  /** Refus du serveur (402) à afficher tel quel : c'est lui qui applique le quota. */
  message?: string | null
}

const FEATURE_LABELS: Record<string, string> = {
  analysis: 'L’analyse du dossier de l’acheteur',
  memoire: 'La rédaction du mémoire technique',
}

export default function SubscriptionWall({ open, onClose, feature = 'analysis', message }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Business, offre la plus haute (11/11/2026) : à son quota, rien à « passer » ; le refus du serveur dit la remise à zéro.
  const plan = useAuthStore((st) => st.organization?.plan)
  const business = plan === 'business'
  const [portail, setPortail] = useState(false)

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    setErreur(null)
    try {
      const { data } = await api.post('/stripe/create-checkout-session', { plan: planId })
      window.location.href = data.url
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      setErreur(typeof detail === 'string' ? detail : "Le paiement n’a pas pu démarrer. Réessayez dans un instant.")
      setLoading(null)
    }
  }

  // Une organisation qui paie déjà change d'offre sur le portail de paiement (le serveur refuse une seconde souscription).
  const ouvrirPortail = async () => {
    setPortail(true)
    setErreur(null)
    try {
      const { data } = await api.get('/stripe/portal')
      window.location.href = data.url
    } catch {
      setErreur('Le portail de paiement n’a pas pu s’ouvrir. Votre abonnement n’est pas touché : réessayez dans un instant.')
      setPortail(false)
    }
  }
  const paie = trouverOffre(plan) !== undefined

  // 402 SIRET (S-05) : l'AO offert attend un SIRET vérifié ; la phrase du serveur et le chemin vers Mon entreprise > Identité.
  if (estRefusSiret(message)) {
    return (
      <Dialogue ouvert={open} onOuvert={(o) => { if (!o) onClose() }} taille="petit" titre="Renseignez votre SIRET" description={message}
        actions={<>
          <Bouton variante="secondaire" onClick={onClose}>Plus tard</Bouton>
          <Bouton asChild variante="principal"><Link to="/company?rubrique=identite" onClick={onClose}>Ouvrir Mon entreprise</Link></Bouton>
        </>} />
    )
  }

  // Le mur d'abonnement est un Dialogue du système (grand) : Échap, clic sur le voile, piège et retour du focus par Radix.
  // Aucun aplat dans la grille : chaque offre a un bouton au trait (le choix revient à l'utilisateur, aucune n'est poussée).
  return (
    <Dialogue ouvert={open} onOuvert={(o) => { if (!o) onClose() }} taille="grand" titre={business ? 'Quota du mois atteint' : 'Passez au niveau supérieur'}
      description={message ?? `${FEATURE_LABELS[feature] ?? 'Cette fonctionnalité'} demande une offre active. Choisissez celle qui suit votre rythme.`}>
    {business ? null : (
    <GrilleOffres
        compacte
        action={(offre) => {
          const geste = gesteOffre(plan, offre.id)
          if (geste === 'actuelle') return <p data-offre-actuelle="" className="flex min-h-11 items-center justify-center text-sm font-medium text-fg-2">Votre offre</p>
          if (geste === 'portail') return (
            <Bouton large onClick={() => { void ouvrirPortail() }} enCours={portail} libelleEnCours="Ouverture du portail…">
              {`Passer à ${offre.nom}`}
            </Bouton>
          )
          return (
            <Bouton large onClick={() => handleSubscribe(offre.id)} enCours={loading === offre.id} libelleEnCours="Ouverture du paiement…">
              {`Choisir ${offre.nom}`}
            </Bouton>
          )
        }}
      />
    )}
      {paie && !business && <p className="text-sm text-fg-2">Le changement d’offre se fait sur le portail de paiement sécurisé de Stripe, qui s’ouvre à la place de cette page.</p>}
        {erreur && <Message ton="erreur">{erreur}</Message>}
      <p className="text-xs text-fg-3">{PHRASE_RESILIATION}</p>
    </Dialogue>
  )
}

import { useState } from 'react'
import { Bouton } from '@/components/ui/bouton'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import { api } from '@/services/api'
import GrilleOffres from '@/components/offres/GrilleOffres'
import { useAuthStore } from '@/stores/authStore'

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
  const business = useAuthStore((st) => st.organization?.plan) === 'business'

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

  // Le mur d'abonnement est un Dialogue du système (grand) : Échap, clic sur le voile, piège et retour du focus par Radix.
  // Aucun aplat dans la grille : chaque offre a un bouton au trait (le choix revient à l'utilisateur, aucune n'est poussée).
  return (
    <Dialogue ouvert={open} onOuvert={(o) => { if (!o) onClose() }} taille="grand" titre={business ? 'Quota du mois atteint' : 'Passez au niveau supérieur'}
      description={message ?? `${FEATURE_LABELS[feature] ?? 'Cette fonctionnalité'} demande une offre active. Choisissez celle qui suit votre rythme.`}>
    {business ? null : (
    <GrilleOffres
        compacte
        action={(offre) => (
          <Bouton large onClick={() => handleSubscribe(offre.id)} enCours={loading === offre.id} libelleEnCours="Ouverture du paiement…">
            {`Choisir ${offre.nom}`}
          </Bouton>
        )}
      />
    )}
        {erreur && <Message ton="erreur">{erreur}</Message>}
      <p className="text-xs text-fg-3">Annulation possible à tout moment. Facturation mensuelle sans engagement.</p>
    </Dialogue>
  )
}

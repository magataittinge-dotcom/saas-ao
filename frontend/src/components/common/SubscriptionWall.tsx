import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles, Zap, Crown, Check } from 'lucide-react'
import { api } from '@/services/api'

interface Props {
  open: boolean
  onClose: () => void
  feature?: 'analysis' | 'memoire'
}

const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    price: '299',
    icon: Zap,
    color: '#0EA5E9',
    colorLight: '#38BDF8',
    bg: 'rgba(14,165,233,0.08)',
    border: 'rgba(14,165,233,0.25)',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
    features: [
      'Analyse IA illimitée',
      'Matrice de conformité automatique',
      'Checklist candidature',
      'Génération mémoire technique IA',
      'Export Word (.docx)',
      'Coffre-fort documentaire',
      '5 projets simultanés',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '499',
    icon: Crown,
    color: '#0F172A',
    colorLight: '#64748B',
    bg: 'rgba(15,23,42,0.06)',
    border: 'rgba(15,23,42,0.20)',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0369A1 100%)',
    popular: true,
    features: [
      'Tout le plan Pro, plus :',
      'Projets illimités',
      'Templates de mémoire personnalisés',
      'Multi-utilisateurs (5 comptes)',
      'Scoring IA des offres',
      'Support prioritaire',
      'Historique complet des AO',
    ],
  },
] as const

const FEATURE_LABELS: Record<string, string> = {
  analysis: "L'analyse IA de votre DCE",
  memoire: 'La génération du mémoire technique',
}

export default function SubscriptionWall({ open, onClose, feature = 'analysis' }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      const { data } = await api.post('/stripe/create-checkout-session', { plan: planId })
      window.location.href = data.url
    } catch {
      setLoading(null)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(6,9,15,0.90)',
          backdropFilter: 'none',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl animate-fade-in"
        style={{
          background: 'rgba(17,28,68,0.95)',
          backdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid rgba(14,165,233,0.15)',
          borderRadius: '24px',
          boxShadow: '0 0 80px rgba(14,165,233,0.08), 0 24px 60px rgba(0,0,0,0.10)',
          maxHeight: '95vh',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-[#F1F5F9] z-10 text-ds-text-2"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="text-center px-6 pt-6 pb-1">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.20), rgba(14,165,233,0.10))',
              border: '1px solid rgba(14,165,233,0.25)',
              boxShadow: '0 0 30px rgba(14,165,233,0.15)',
            }}
          >
            <Sparkles size={22} className="text-ds-cyan" />
          </div>
          <h2 className="text-lg font-bold text-ds-text">
            Passez au niveau supérieur
          </h2>
          <p className="text-sm text-ds-text-2 mt-1.5 max-w-md mx-auto">
            {FEATURE_LABELS[feature] ?? 'Cette fonctionnalité'} nécessite un abonnement actif.
            Choisissez le plan adapté à votre activité.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {PLANS.map((plan) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-2xl p-4 transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: plan.bg,
                  border: `1px solid ${plan.border}`,
                  boxShadow: `0 0 24px ${plan.bg}`,
                }}
              >
                {'popular' in plan && plan.popular && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-0.5 rounded-full"
                    style={{
                      background: plan.gradient,
                      color: '#fff',
                      boxShadow: `0 0 12px rgba(139,92,246,0.40)`,
                    }}
                  >
                    Populaire
                  </span>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}40` }}
                  >
                    <Icon size={16} style={{ color: plan.color }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: plan.colorLight }}>
                    {plan.name}
                  </span>
                </div>

                <div className="mb-3">
                  <span className="text-3xl font-bold text-white">{plan.price}€</span>
                  <span className="text-sm text-ds-text-3">/mois HT</span>
                </div>

                <ul className="space-y-1.5 mb-4 flex-1">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Check size={12} className="shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span className="text-ds-text-2">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    background: plan.gradient,
                    color: '#fff',
                    border: 'none',
                    boxShadow: `0 4px 16px ${plan.color}30`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
                >
                  {loading === plan.id ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    `Choisir ${plan.name}`
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center px-6 pb-5">
          <p className="text-xs text-ds-text-3">
            Annulation possible à tout moment. Facturation mensuelle sans engagement.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

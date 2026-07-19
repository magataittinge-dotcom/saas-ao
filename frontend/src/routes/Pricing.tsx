import { Link } from 'react-router-dom'
import { CheckCircle2, X, Zap, Crown, Sparkles } from 'lucide-react'

const plans = [
  {
    id: 'free',
    name: 'Gratuit',
    price: '0',
    users: '1 utilisateur',
    target: 'Découverte',
    icon: Sparkles,
    color: '#9BA4B5',
    features: [
      { text: '1 AO par mois', included: true },
      { text: 'Upload DCE', included: true },
      { text: 'Détection des lots', included: true },
      { text: 'Analyse IA du DCE', included: false },
      { text: 'Matrice de conformité', included: false },
      { text: 'Génération mémoire technique', included: false },
      { text: 'Export Word (.docx)', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '349',
    users: '1-2 utilisateurs',
    target: 'PME BTP (CA < 10M)',
    icon: Zap,
    color: '#E4E9F2',
    features: [
      { text: '15 AO par mois', included: true },
      { text: 'Analyse IA illimitée', included: true },
      { text: 'Matrice de conformité', included: true },
      { text: 'Génération mémoire technique', included: true },
      { text: 'Export Word (.docx)', included: true },
      { text: 'Coffre-fort documentaire', included: true },
      { text: "Alertes d'expiration", included: true },
      { text: 'Support email', included: true },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '599',
    users: '5+ utilisateurs',
    target: 'ETI BTP (CA > 10M)',
    icon: Crown,
    color: '#F4F6FA',
    popular: true,
    features: [
      { text: 'AO illimités', included: true },
      { text: 'Tout le plan Pro', included: true },
      { text: '5 utilisateurs inclus', included: true },
      { text: 'Templates mémoires multiples', included: true },
      { text: 'Import Excel références', included: true },
      { text: 'Statistiques avancées', included: true },
      { text: 'Support prioritaire', included: true },
      { text: 'Onboarding personnalisé', included: true },
    ],
  },
]

export default function Pricing() {
  return (
    <div className="min-h-screen py-16 px-6 relative" style={{ background: '#1C222D' }}>
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-extrabold mb-4" style={{ color: '#F4F6FA', fontFamily: 'Geist Sans, system-ui, sans-serif' }}>
            Tarifs simples et transparents
          </h1>
          <p className="text-lg" style={{ color: '#9BA4B5' }}>
            Economisez 2 jours de travail par AO. Rentabilisé en 1 réponse.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.id}
                className="relative rounded-2xl"
                style={
                  plan.popular
                    ? { background: 'linear-gradient(135deg, #E4E9F2, rgba(228,233,242,0.20))', padding: '1px' }
                    : {}
                }
              >
                {plan.popular && (
                  <div
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full text-xs font-semibold"
                    style={{ background: '#E4E9F2', color: '#0A0C11', boxShadow: '0 8px 24px -12px rgba(228,233,242,0.55)' }}
                  >
                    Recommandé
                  </div>
                )}
                <div
                  className="rounded-2xl p-7 h-full flex flex-col"
                  style={{
                    background: '#151A23',
                    border: plan.popular ? 'none' : '1px solid rgba(186,205,234,.13)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${plan.color}12`, border: `1px solid ${plan.color}25` }}>
                      <Icon size={17} style={{ color: plan.color }} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold" style={{ color: '#F4F6FA' }}>{plan.name}</h2>
                      <p className="text-xs" style={{ color: '#788295' }}>{plan.target}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <span className="text-4xl font-extrabold" style={{ color: '#F4F6FA', fontFamily: 'Geist Sans, system-ui, sans-serif' }}>
                      {plan.price}€
                    </span>
                    <span className="text-sm ml-1" style={{ color: '#788295' }}>/mois HT</span>
                    <p className="text-xs mt-1" style={{ color: '#788295' }}>{plan.users}</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-7 flex-1">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-center gap-2.5 text-sm">
                        {f.included ? (
                          <CheckCircle2 size={15} className="shrink-0" style={{ color: '#E4E9F2' }} />
                        ) : (
                          <X size={15} className="shrink-0" style={{ color: '#5C6678' }} />
                        )}
                        <span style={{ color: f.included ? '#E8EBF2' : '#788295' }}>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    to={plan.id === 'free' ? '/register' : `/register?plan=${plan.id}`}
                    className={plan.popular ? 'signature-btn block w-full text-center py-3 rounded-xl text-sm' : 'block w-full text-center font-semibold py-3 rounded-xl text-sm transition-all duration-200'}
                    style={
                      plan.popular
                        ? {}
                        : { background: '#1C222D', color: '#9BA4B5', border: '1px solid rgba(186,205,234,.13)' }
                    }
                    onMouseEnter={(e) => {
                      if (!plan.popular) {
                        e.currentTarget.style.borderColor = '#5C6678'
                        e.currentTarget.style.color = '#F4F6FA'
                        e.currentTarget.style.background = '#1C222D'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!plan.popular) {
                        e.currentTarget.style.borderColor = '#1C222D'
                        e.currentTarget.style.color = '#9BA4B5'
                        e.currentTarget.style.background = '#1C222D'
                      }
                    }}
                  >
                    {plan.id === 'free' ? 'Commencer gratuitement' : `Commencer avec ${plan.name}`}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-center text-sm mt-10" style={{ color: '#788295' }}>
          Sans engagement · Résiliable à tout moment · Support inclus
        </p>
      </div>
    </div>
  )
}

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
    color: '#64748B',
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
    price: '249',
    users: '1-2 utilisateurs',
    target: 'PME BTP (CA < 10M)',
    icon: Zap,
    color: '#3B82F6',
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
    price: '399',
    users: '5+ utilisateurs',
    target: 'ETI BTP (CA > 10M)',
    icon: Crown,
    color: '#8B5CF6',
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
    <div className="min-h-screen py-16 px-6 relative" style={{ background: '#050508' }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-extrabold mb-4" style={{ color: '#E8ECF4', fontFamily: 'Outfit, system-ui, sans-serif' }}>
            Tarifs simples et transparents
          </h1>
          <p className="text-lg" style={{ color: '#8B95A9' }}>
            Economisez 2 jours de travail par AO. Rentabilisé en 1 réponse.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.id}
                className="relative rounded-2xl p-[1px]"
                style={
                  plan.popular
                    ? { background: 'linear-gradient(135deg, rgba(59,130,246,0.5), rgba(6,182,212,0.3), rgba(139,92,246,0.4))' }
                    : { background: 'rgba(255,255,255,0.05)' }
                }
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}>
                    Recommandé
                  </div>
                )}
                <div
                  className="rounded-2xl p-7 h-full flex flex-col"
                  style={{
                    background: 'rgba(12,17,30,0.55)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${plan.color}18`, border: `1px solid ${plan.color}30` }}>
                      <Icon size={17} style={{ color: plan.color }} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold" style={{ color: '#E8ECF4' }}>{plan.name}</h2>
                      <p className="text-xs" style={{ color: '#556177' }}>{plan.target}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <span className="text-4xl font-extrabold" style={{ color: '#E8ECF4', fontFamily: 'Outfit, system-ui, sans-serif' }}>
                      {plan.price}€
                    </span>
                    <span className="text-sm ml-1" style={{ color: '#556177' }}>/mois HT</span>
                    <p className="text-xs mt-1" style={{ color: '#556177' }}>{plan.users}</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-7 flex-1">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-center gap-2.5 text-sm">
                        {f.included ? (
                          <CheckCircle2 size={15} className="shrink-0" style={{ color: '#10B981' }} />
                        ) : (
                          <X size={15} className="shrink-0" style={{ color: '#EF4444', opacity: 0.7 }} />
                        )}
                        <span style={{ color: f.included ? '#8B95A9' : '#556177' }}>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    to={plan.id === 'free' ? '/register' : `/register?plan=${plan.id}`}
                    className="block w-full text-center font-semibold py-3 rounded-xl text-sm transition-all duration-200"
                    style={
                      plan.popular
                        ? { background: '#3B82F6', color: '#fff', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }
                        : { background: 'transparent', color: '#8B95A9', border: '1px solid rgba(255,255,255,0.10)' }
                    }
                    onMouseEnter={(e) => {
                      if (!plan.popular) {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'
                        e.currentTarget.style.color = '#E8ECF4'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!plan.popular) {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                        e.currentTarget.style.color = '#8B95A9'
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

        <p className="text-center text-sm mt-10" style={{ color: '#556177' }}>
          Sans engagement · Résiliable à tout moment · Support inclus
        </p>
      </div>
    </div>
  )
}

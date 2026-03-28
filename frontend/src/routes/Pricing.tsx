import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

const plans = [
  {
    name: 'Pro',
    price: '249',
    users: '1-2 utilisateurs',
    target: 'PME BTP (CA < 10M€)',
    features: [
      'AO illimités',
      'Analyse IA du DCE',
      'Compliance matrix',
      'Génération mémoire technique',
      'Export Word (.docx)',
      'Coffre-fort documentaire',
      'Alertes d\'expiration',
      'Support email',
    ],
  },
  {
    name: 'Business',
    price: '399',
    users: '5+ utilisateurs',
    target: 'ETI BTP (CA > 10M€)',
    popular: true,
    features: [
      'Tout le plan Pro',
      '5 utilisateurs inclus',
      'Templates mémoires multiples',
      'Import Excel références',
      'Statistiques avancées',
      'Support prioritaire',
      'Onboarding personnalisé',
    ],
  },
]

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Tarifs simples et transparents</h1>
          <p className="text-gray-600 text-lg">
            Économisez 2 jours de travail par AO. Rentabilisé en 1 réponse.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl border p-8 relative ${
                plan.popular ? 'border-blue-500 shadow-lg' : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Recommandé
                </span>
              )}
              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              <p className="text-gray-500 text-sm mt-1">{plan.target}</p>
              <div className="my-4">
                <span className="text-4xl font-extrabold text-gray-900">{plan.price}€</span>
                <span className="text-gray-400 text-sm">/mois HT</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">{plan.users}</p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to={`/register?plan=${plan.name.toLowerCase()}`}
                className={`block w-full text-center font-semibold py-3 rounded-xl transition-colors ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                Commencer avec {plan.name}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Sans engagement · Résiliable à tout moment · Support inclus
        </p>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { CheckCircle2, Zap, Shield, FileText } from 'lucide-react'

const features = [
  {
    icon: FileText,
    title: 'Analyse automatique du DCE',
    description: "L'IA lit le RC et le CCTP, extrait toutes les exigences et génère une compliance matrix interactive.",
  },
  {
    icon: Zap,
    title: 'Mémoire technique en 1 clic',
    description: 'Générez un mémoire technique professionnel de ~20 pages adapté à votre projet, exportable en Word.',
  },
  {
    icon: Shield,
    title: 'Coffre-fort documentaire',
    description: 'Stockez vos documents administratifs et recevez des alertes avant expiration.',
  },
  {
    icon: CheckCircle2,
    title: 'Checklist intelligente',
    description: "Vérification automatique de tous les documents requis avec matching depuis votre coffre-fort.",
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="font-bold text-xl text-gray-900">
          AO BTP <span className="text-blue-600 text-sm font-normal">IA</span>
        </span>
        <div className="flex items-center gap-4">
          <Link to="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Tarifs</Link>
          <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Connexion</Link>
          <Link
            to="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Essayer gratuitement
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          Répondez aux appels d'offres BTP{' '}
          <span className="text-blue-600">10x plus vite</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          L'IA analyse votre DCE, génère votre mémoire technique et vérifie tous vos documents.
          Un AO en 2 heures au lieu de 2 jours.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl text-lg transition-colors"
          >
            Commencer maintenant
          </Link>
          <Link
            to="/pricing"
            className="text-gray-600 hover:text-gray-900 font-medium py-3 px-6 rounded-xl border border-gray-300 hover:border-gray-400 transition-colors"
          >
            Voir les tarifs
          </Link>
        </div>
        <p className="text-sm text-gray-400 mt-4">
          Pro à 249€/mois · Business à 399€/mois · Sans engagement
        </p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Tout ce dont vous avez besoin pour répondre aux AO
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-gray-50 rounded-2xl p-6 flex gap-4">
              <div className="p-2 bg-blue-100 rounded-lg h-fit">
                <Icon size={22} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-600">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Prêt à gagner du temps sur vos AO ?
        </h2>
        <p className="text-blue-100 mb-8">Rejoignez les entreprises BTP qui répondent plus vite et mieux.</p>
        <Link
          to="/register"
          className="bg-white text-blue-600 hover:bg-blue-50 font-semibold py-3 px-8 rounded-xl text-lg transition-colors"
        >
          Créer mon compte
        </Link>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-gray-400">
        © 2026 AO BTP — Tous droits réservés
      </footer>
    </div>
  )
}

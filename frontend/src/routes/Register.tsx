import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useRegister } from '@/hooks/useAuth'

const schema = z.object({
  name: z.string().min(2, 'Nom requis'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Minimum 8 caractères'),
  organization_name: z.string().min(2, "Nom d'entreprise requis"),
  siret: z.string().length(14, 'SIRET doit contenir 14 chiffres').regex(/^\d+$/, 'SIRET invalide'),
  plan: z.enum(['pro', 'business']),
})

type FormData = z.infer<typeof schema>

export default function Register() {
  const { mutate: register, isPending, error, isError } = useRegister()

  const errorMessage = isError && axios.isAxiosError(error)
    ? (error.response?.data?.detail ?? 'Une erreur est survenue. Vérifiez vos informations.')
    : 'Une erreur est survenue. Vérifiez vos informations.'

  const {
    register: field,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { plan: 'pro' },
  })

  const selectedPlan = watch('plan')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Créer mon compte</h1>
          <p className="text-gray-500 text-sm mt-1">Commencez à répondre aux AO 10x plus vite</p>
        </div>

        <form onSubmit={handleSubmit((data) => register(data))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom</label>
              <input
                {...field('name')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mohammed Dupont"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
              <input
                {...field('organization_name')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Car Iso Facade SARL"
              />
              {errors.organization_name && <p className="text-red-500 text-xs mt-1">{errors.organization_name.message}</p>}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
              <input
                {...field('siret')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="12345678901234"
                maxLength={14}
              />
              {errors.siret && <p className="text-red-500 text-xs mt-1">{errors.siret.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                {...field('email')}
                type="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="vous@entreprise.fr"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input
                {...field('password')}
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          </div>

          {/* Plan selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Votre plan</label>
            <div className="grid grid-cols-2 gap-3">
              {(['pro', 'business'] as const).map((plan) => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setValue('plan', plan)}
                  className={`border-2 rounded-lg p-3 text-left transition-all ${
                    selectedPlan === plan
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-sm capitalize">{plan}</p>
                  <p className="text-lg font-bold text-blue-600">
                    {plan === 'pro' ? '249€' : '399€'}
                    <span className="text-xs font-normal text-gray-500">/mois HT</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {plan === 'pro' ? '1-2 utilisateurs' : '5+ utilisateurs'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {isError && (
            <p className="text-red-500 text-sm text-center">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {isPending ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Sparkles, User, Building2, Hash, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
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

const PLANS = [
  {
    id: 'pro' as const,
    price: '249€',
    label: 'Pro',
    desc: '1–2 utilisateurs · AO illimités',
    features: ['Analyse DCE complète', 'Mémoire technique IA', 'Coffre-fort documentaire'],
  },
  {
    id: 'business' as const,
    price: '399€',
    label: 'Business',
    desc: '5+ utilisateurs · Tout inclus',
    features: ['Tout le plan Pro', 'Multi-utilisateurs', 'Support prioritaire'],
  },
]

function InputField({
  icon: Icon, label, error, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType
  label: string
  error?: string
}) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: '#CBD5E1', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
      >
        {label}
      </label>
      <div className="relative">
        <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#475569' }} />
        <input {...props} className="input-dark pl-9" />
      </div>
      {error && (
        <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#F87171' }}>
          <AlertCircle size={11} />{error}
        </p>
      )}
    </div>
  )
}

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
    <div
      className="min-h-screen flex items-center justify-center p-4 py-10"
      style={{ background: '#080B12' }}
    >
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0EA5E9 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #00D4AA 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-lg animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0EA5E9, #00D4AA)', boxShadow: '0 0 20px rgba(14,165,233,0.40)' }}
          >
            <Sparkles size={17} className="text-white" />
          </div>
          <span
            className="text-2xl font-bold tracking-tight text-gradient"
            style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
          >
            SYNORIX
          </span>
        </div>

        {/* Card */}
        <div
          className="glass-card p-8"
          style={{ border: '1px solid rgba(14,165,233,0.12)' }}
        >
          <div className="mb-7 text-center">
            <h1
              className="text-2xl font-bold text-white mb-1"
              style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
            >
              Créer mon compte
            </h1>
            <p className="text-sm" style={{ color: '#64748B' }}>
              Commencez à répondre aux AO 10× plus vite
            </p>
          </div>

          <form onSubmit={handleSubmit((data) => register(data))} className="space-y-4">
            <InputField
              {...field('name')}
              icon={User}
              label="Votre nom"
              placeholder="Mohammed Dupont"
              error={errors.name?.message}
            />

            <InputField
              {...field('organization_name')}
              icon={Building2}
              label="Nom de l'entreprise"
              placeholder="Car Iso Facade SARL"
              error={errors.organization_name?.message}
            />

            <InputField
              {...field('siret')}
              icon={Hash}
              label="SIRET"
              placeholder="12345678901234"
              maxLength={14}
              error={errors.siret?.message}
            />

            <div className="grid grid-cols-2 gap-4">
              <InputField
                {...field('email')}
                icon={Mail}
                label="Email"
                type="email"
                placeholder="vous@entreprise.fr"
                autoComplete="email"
                error={errors.email?.message}
              />
              <InputField
                {...field('password')}
                icon={Lock}
                label="Mot de passe"
                type="password"
                placeholder="Min. 8 caractères"
                autoComplete="new-password"
                error={errors.password?.message}
              />
            </div>

            {/* Plan selection */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: '#CBD5E1', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
              >
                Votre plan
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PLANS.map((plan) => {
                  const isSelected = selectedPlan === plan.id
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setValue('plan', plan.id)}
                      className="text-left rounded-xl p-4 transition-all duration-200"
                      style={{
                        background: isSelected ? 'rgba(14,165,233,0.10)' : 'rgba(255,255,255,0.03)',
                        border: isSelected
                          ? '1px solid rgba(14,165,233,0.35)'
                          : '1px solid rgba(255,255,255,0.07)',
                        boxShadow: isSelected ? '0 0 20px rgba(14,165,233,0.10)' : 'none',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: isSelected ? '#7DD3FC' : '#94A3B8', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
                        >
                          {plan.label}
                        </span>
                        {isSelected && (
                          <CheckCircle2 size={14} style={{ color: '#0EA5E9' }} />
                        )}
                      </div>
                      <p
                        className="text-xl font-bold mb-1"
                        style={{ color: isSelected ? '#E2E8F0' : '#64748B', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
                      >
                        {plan.price}
                        <span className="text-xs font-normal ml-1" style={{ color: '#475569' }}>/mois HT</span>
                      </p>
                      <p className="text-xs mb-2" style={{ color: '#475569' }}>{plan.desc}</p>
                      <ul className="space-y-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs" style={{ color: '#64748B' }}>
                            <span style={{ color: '#00D4AA' }}>✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* API error */}
            {isError && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}
              >
                <AlertCircle size={14} className="shrink-0" />
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary w-full py-3 text-sm font-semibold mt-1"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Création du compte...
                </span>
              ) : (
                'Créer mon compte'
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: '#475569' }}>
            Déjà un compte ?{' '}
            <Link
              to="/login"
              className="font-medium transition-colors"
              style={{ color: '#0EA5E9' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#7DD3FC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#0EA5E9')}
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

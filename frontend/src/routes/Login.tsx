import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Sparkles, Mail, Lock, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { useLogin } from '@/hooks/useAuth'

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe trop court'),
})
type FormData = z.infer<typeof schema>

export default function Login() {
  const { mutate: login, isPending, error, isError } = useLogin()
  const errorMessage = isError && axios.isAxiosError(error)
    ? (error.response?.data?.detail ?? 'Email ou mot de passe incorrect') : 'Email ou mot de passe incorrect'

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })
  const onSubmit = (data: FormData) => login(data)

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080B12' }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)', boxShadow: '0 0 25px rgba(59,130,246,0.5)' }}>
            <Sparkles size={18} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight"
            style={{ background: 'linear-gradient(135deg, #60A5FA, #22D3EE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            SYNORIX
          </span>
        </div>

        {/* Glow behind card */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-10"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', filter: 'blur(80px)', width: '500px', height: '500px' }} />

        {/* Card — Glass Auth */}
        <div className="glass-auth p-8">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>Connexion</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Accédez à votre espace AO BTP</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input {...register('email')} type="email" className="glass-input pl-9 w-full py-2.5 text-sm" placeholder="vous@entreprise.fr" autoComplete="email" />
              </div>
              {errors.email && <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#F87171' }}><AlertCircle size={11} />{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Mot de passe</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input {...register('password')} type="password" className="glass-input pl-9 w-full py-2.5 text-sm" placeholder="••••••••" autoComplete="current-password" />
              </div>
              {errors.password && <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#F87171' }}><AlertCircle size={11} />{errors.password.message}</p>}
            </div>

            {isError && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#F87171' }}>
                <AlertCircle size={14} className="shrink-0" />{errorMessage}
              </div>
            )}

            <button type="submit" disabled={isPending} className="btn-primary w-full py-3 text-sm font-semibold mt-2"
              style={{ borderRadius: '12px', boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
              {isPending ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Connexion...</span> : 'Se connecter'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Pas encore de compte ?{' '}
            <Link to="/register" className="font-medium transition-colors" style={{ color: '#3B82F6' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#93C5FD')} onMouseLeave={(e) => (e.currentTarget.style.color = '#3B82F6')}>
              S'inscrire
            </Link>
          </p>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Synorix · Réponses aux AO BTP automatisées par IA
        </p>
      </div>
    </div>
  )
}

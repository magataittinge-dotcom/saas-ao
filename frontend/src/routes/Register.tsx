import { SignUp } from '@clerk/clerk-react'
import { Sparkles } from 'lucide-react'

const clerkAppearance = {
  variables: {
    colorPrimary: '#3B82F6',
    colorBackground: 'rgba(12,17,30,0.7)',
    colorText: '#E8ECF4',
    colorTextSecondary: '#8B95A9',
    colorInputBackground: 'rgba(255,255,255,0.04)',
    colorInputText: '#E8ECF4',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full',
    card: {
      backgroundColor: 'rgba(12,17,30,0.55)',
      backdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    },
    headerTitle: { color: '#E8ECF4', fontFamily: 'Outfit, system-ui, sans-serif' },
    headerSubtitle: { color: '#8B95A9' },
    socialButtonsBlockButton: {
      backgroundColor: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#E8ECF4',
    },
    formFieldLabel: { color: '#8B95A9' },
    formFieldInput: {
      backgroundColor: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#E8ECF4',
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #3B82F6, #22D3EE)',
      fontWeight: '500',
      borderRadius: '12px',
    },
    footerActionLink: { color: '#3B82F6' },
    footer: { backgroundColor: 'transparent' },
    footerAction: { backgroundColor: 'transparent' },
    dividerLine: { backgroundColor: 'rgba(255,255,255,0.06)' },
    dividerText: { color: '#556177' },
    identityPreview: { backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' },
    identityPreviewText: { color: '#E8ECF4' },
    identityPreviewEditButton: { color: '#3B82F6' },
    formFieldAction: { color: '#3B82F6' },
    alert: { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#F87171' },
  },
} as const

export default function Register() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: '#06090F' }}>
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-[600px] h-[600px] rounded-full blur-3xl opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/3 w-[350px] h-[350px] rounded-full blur-3xl opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }} />
      </div>

      {/* Glow behind form */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />

      {/* Single centered container — fixed width matching Clerk form */}
      <div className="relative w-full flex flex-col items-center animate-fade-in" style={{ maxWidth: '420px' }}>
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
              boxShadow: '0 0 40px rgba(59,130,246,0.45), 0 0 80px rgba(59,130,246,0.15)',
            }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #60A5FA, #22D3EE)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: 'Outfit, system-ui, sans-serif',
            }}>
            SYNORIX
          </span>
          <p className="text-sm text-center"
            style={{ color: '#8B95A9', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            Répondez aux appels d'offres BTP 10× plus vite grâce à l'IA
          </p>
        </div>

        {/* Clerk SignUp */}
        <SignUp
          routing="path"
          path="/register"
          signInUrl="/login"
          appearance={clerkAppearance}
        />

        <p className="text-center text-xs mt-6"
          style={{ color: '#556177', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
          Synorix · Réponses aux AO BTP automatisées par IA
        </p>
      </div>
    </div>
  )
}

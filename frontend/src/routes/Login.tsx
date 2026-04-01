import { SignIn } from '@clerk/clerk-react'
import { Sparkles } from 'lucide-react'

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080B12' }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in flex flex-col items-center">
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

        {/* Clerk SignIn */}
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/register"
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'bg-transparent shadow-none border-0',
              headerTitle: 'text-white',
              headerSubtitle: 'text-gray-400',
              socialButtonsBlockButton: 'border-white/10 text-white hover:bg-white/5',
              formFieldLabel: 'text-gray-400',
              formFieldInput: 'bg-white/5 border-white/10 text-white placeholder:text-gray-500',
              formButtonPrimary: 'bg-blue-500 hover:bg-blue-600',
              footerActionLink: 'text-blue-400 hover:text-blue-300',
              identityPreview: 'bg-white/5 border-white/10',
              identityPreviewText: 'text-white',
              identityPreviewEditButton: 'text-blue-400',
              formFieldAction: 'text-blue-400',
              alert: 'bg-red-500/10 border-red-500/20 text-red-400',
            },
          }}
        />

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Synorix · Réponses aux AO BTP automatisées par IA
        </p>
      </div>
    </div>
  )
}

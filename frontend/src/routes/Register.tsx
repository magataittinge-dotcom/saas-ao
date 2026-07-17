import { SignUp } from '@clerk/clerk-react'
import { Sparkles } from 'lucide-react'

const clerkAppearance = {
  variables: {
    colorPrimary: '#E4E9F2',
    colorBackground: '#151A23',
    colorText: '#F4F6FA',
    colorTextSecondary: '#9BA4B5',
    colorInputBackground: '#0F1218',
    colorInputText: '#F4F6FA',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full',
    card: {
      backgroundColor: '#151A23',
      border: '1px solid rgba(186,205,234,.13)',
      borderRadius: '20px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    },
    headerTitle: { color: '#F4F6FA', fontFamily: 'DM Sans, system-ui, sans-serif' },
    headerSubtitle: { color: '#9BA4B5' },
    socialButtonsBlockButton: {
      backgroundColor: '#141922',
      border: '1px solid rgba(186,205,234,.13)',
      color: '#F4F6FA',
    },
    formFieldLabel: { color: '#9BA4B5' },
    formFieldInput: {
      backgroundColor: '#141922',
      border: '1px solid rgba(186,205,234,.13)',
      color: '#F4F6FA',
    },
    formButtonPrimary: {
      background: '#E4E9F2',
      fontWeight: '500',
      borderRadius: '12px',
    },
    footerActionLink: { color: '#E4E9F2' },
    footer: { backgroundColor: 'transparent' },
    footerAction: { backgroundColor: 'transparent' },
    dividerLine: { backgroundColor: 'rgba(186,205,234,.13)' },
    dividerText: { color: '#788295' },
    identityPreview: { backgroundColor: '#141922', border: '1px solid rgba(186,205,234,.13)' },
    identityPreviewText: { color: '#F4F6FA' },
    identityPreviewEditButton: { color: '#E4E9F2' },
    formFieldAction: { color: '#E4E9F2' },
    alert: { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#F58E86' },
  },
} as const

export default function Register() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: '#141922' }}>
      {/* Single centered container — fixed width matching Clerk form */}
      <div className="relative w-full flex flex-col items-center animate-fade-in" style={{ maxWidth: '420px' }}>
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #F4F6FA 0%, #3A4556 40%, #C3CCDC 100%)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #F4F6FA 0%, #3A4556 40%, #C3CCDC 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}>
            SYNORIX
          </span>
          <p className="text-sm text-center font-sans" style={{ color: '#9BA4B5' }}>
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

        <p className="text-center text-xs mt-6 font-sans" style={{ color: '#788295' }}>
          Synorix · Réponses aux AO BTP automatisées par IA
        </p>

        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center mt-3">
          {[
            ['/legal/mentions-legales', 'Mentions légales'],
            ['/legal/cgu', 'CGU'],
            ['/legal/cgv', 'CGV'],
            ['/legal/politique-confidentialite', 'Confidentialité'],
            ['/legal/cookies', 'Cookies'],
          ].map(([to, label]) => (
            <a
              key={to}
              href={to}
              className="text-[11px] transition-colors"
              style={{ color: '#788295' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#E4E9F2' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#788295' }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}

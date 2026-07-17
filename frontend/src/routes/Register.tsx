import { SignUp } from '@clerk/clerk-react'
import { Sparkles } from 'lucide-react'

const clerkAppearance = {
  variables: {
    colorPrimary: '#22D3EE',
    colorBackground: '#1A1D21',
    colorText: '#E7EAEE',
    colorTextSecondary: '#9AA3AE',
    colorInputBackground: '#232730',
    colorInputText: '#E7EAEE',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full',
    card: {
      backgroundColor: '#1A1D21',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '20px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    },
    headerTitle: { color: '#E7EAEE', fontFamily: 'Geist Sans, system-ui, sans-serif' },
    headerSubtitle: { color: '#9AA3AE' },
    socialButtonsBlockButton: {
      backgroundColor: '#232730',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#E7EAEE',
    },
    formFieldLabel: { color: '#9AA3AE' },
    formFieldInput: {
      backgroundColor: '#232730',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#E7EAEE',
    },
    formButtonPrimary: {
      background: '#22D3EE',
      color: '#0A0B0D',
      fontWeight: '600',
      borderRadius: '12px',
    },
    footerActionLink: { color: '#22D3EE' },
    footer: { backgroundColor: 'transparent' },
    footerAction: { backgroundColor: 'transparent' },
    dividerLine: { backgroundColor: '#232730' },
    dividerText: { color: '#6B7280' },
    identityPreview: { backgroundColor: '#232730', border: '1px solid rgba(255,255,255,0.06)' },
    identityPreviewText: { color: '#E7EAEE' },
    identityPreviewEditButton: { color: '#22D3EE' },
    formFieldAction: { color: '#22D3EE' },
    alert: { backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#F87171' },
  },
} as const

export default function Register() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: '#0A0B0D' }}>
      {/* Single centered container — fixed width matching Clerk form */}
      <div className="relative w-full flex flex-col items-center animate-fade-in" style={{ maxWidth: '420px' }}>
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'radial-gradient(120% 80% at 50% 100%, rgba(34,211,238,0.22), transparent 65%), #121417',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), 0 8px 24px -12px rgba(34,211,238,0.35)',
            }}>
            <Sparkles size={24} style={{ color: '#22D3EE' }} />
          </div>
          <span className="text-gradient text-3xl font-extrabold tracking-tight"
            style={{ fontFamily: 'Geist Sans, system-ui, sans-serif' }}>
            SYNORIX
          </span>
          <p className="text-sm text-center font-sans" style={{ color: '#9AA3AE' }}>
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

        <p className="text-center text-xs mt-6 font-sans" style={{ color: '#6B7280' }}>
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
              style={{ color: '#6B7280' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#22D3EE' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6B7280' }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}

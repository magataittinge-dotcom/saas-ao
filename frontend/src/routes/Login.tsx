import { SignIn } from '@clerk/clerk-react'
import { Sparkles } from 'lucide-react'

const clerkAppearance = {
  variables: {
    colorPrimary: '#0EA5E9',
    colorBackground: '#FFFFFF',
    colorText: '#0F172A',
    colorTextSecondary: '#64748B',
    colorInputBackground: '#F8FAFC',
    colorInputText: '#0F172A',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full',
    card: {
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '20px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    },
    headerTitle: { color: '#0F172A', fontFamily: 'DM Sans, system-ui, sans-serif' },
    headerSubtitle: { color: '#64748B' },
    socialButtonsBlockButton: {
      backgroundColor: '#F8FAFC',
      border: '1px solid #E2E8F0',
      color: '#0F172A',
    },
    formFieldLabel: { color: '#64748B' },
    formFieldInput: {
      backgroundColor: '#F8FAFC',
      border: '1px solid #E2E8F0',
      color: '#0F172A',
    },
    formButtonPrimary: {
      background: '#0EA5E9',
      fontWeight: '500',
      borderRadius: '12px',
    },
    footerActionLink: { color: '#0EA5E9' },
    footer: { backgroundColor: 'transparent' },
    footerAction: { backgroundColor: 'transparent' },
    dividerLine: { backgroundColor: '#E2E8F0' },
    dividerText: { color: '#94A3B8' },
    identityPreview: { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' },
    identityPreviewText: { color: '#0F172A' },
    identityPreviewEditButton: { color: '#0EA5E9' },
    formFieldAction: { color: '#0EA5E9' },
    alert: { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#DC2626' },
  },
} as const

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F8FAFC' }}>
      {/* Single centered container — fixed width matching Clerk form */}
      <div className="relative w-full flex flex-col items-center animate-fade-in" style={{ maxWidth: '420px' }}>
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0F172A 0%, #0C4A6E 40%, #0284C7 100%)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #0C4A6E 40%, #0284C7 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}>
            SYNORIX
          </span>
          <p className="text-sm text-center font-sans" style={{ color: '#64748B' }}>
            Répondez aux appels d'offres BTP 10× plus vite grâce à l'IA
          </p>
        </div>

        {/* Clerk SignIn */}
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/register"
          appearance={clerkAppearance}
        />

        <p className="text-center text-xs mt-6 font-sans" style={{ color: '#94A3B8' }}>
          Synorix · Réponses aux AO BTP automatisées par IA
        </p>
      </div>
    </div>
  )
}

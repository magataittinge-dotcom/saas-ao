import { type ReactNode } from 'react'
import { Settings as SettingsIcon, User, Building2, CreditCard, ChevronRight, Shield } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pro:      { label: 'Pro',      color: '#38BDF8', bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.30)' },
  business: { label: 'Business', color: '#5EEAD4', bg: 'rgba(0,212,170,0.12)',   border: 'rgba(0,212,170,0.30)' },
  free:     { label: 'Gratuit',  color: '#94A3B8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' },
}

function SectionCard({ icon, title, children }: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid rgba(14,165,233,0.08)', background: 'rgba(14,165,233,0.02)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.18)' }}
        >
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-ds-text">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-sm text-ds-text-2">{label}</span>
      <span className="text-sm font-medium text-ds-text">{value ?? <span className="text-ds-text-3 italic">—</span>}</span>
    </div>
  )
}

export default function Settings() {
  const { user, organization } = useAuthStore()

  const plan     = organization?.plan ?? 'free'
  const planCfg  = PLAN_LABELS[plan] ?? PLAN_LABELS.free
  const planPrice = plan === 'pro' ? '249€' : plan === 'business' ? '399€' : '0€'

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.18)' }}
        >
          <SettingsIcon size={18} style={{ color: '#0EA5E9' }} />
        </div>
        <div>
          <h1 className="text-ds-text leading-tight">Paramètres</h1>
          <p className="text-xs text-ds-text-3 mt-0.5">Gérez votre compte et votre abonnement</p>
        </div>
      </div>

      {/* ── Profil ─────────────────────────────────────────────────────── */}
      <SectionCard icon={<User size={15} style={{ color: '#0EA5E9' }} />} title="Mon profil">
        <div className="divide-y" style={{ borderColor: 'transparent' }}>
          <InfoRow label="Nom complet"  value={user?.name} />
          <InfoRow label="Adresse email" value={user?.email} />
          <InfoRow
            label="Rôle"
            value={
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(14,165,233,0.10)', color: '#7DD3FC', border: '1px solid rgba(14,165,233,0.20)' }}
              >
                <Shield size={10} />
                {user?.role ?? 'admin'}
              </span>
            }
          />
        </div>
      </SectionCard>

      {/* ── Entreprise ──────────────────────────────────────────────────── */}
      <SectionCard icon={<Building2 size={15} style={{ color: '#00D4AA' }} />} title="Entreprise">
        <div className="divide-y" style={{ borderColor: 'transparent' }}>
          <InfoRow label="Raison sociale"   value={organization?.name} />
          <InfoRow label="SIRET"            value={(organization as any)?.siret} />
          <InfoRow label="Secteur d'activité" value={(organization as any)?.sector} />
          <InfoRow label="Effectif"         value={(organization as any)?.headcount} />
        </div>
        <p className="text-xs text-ds-text-3 mt-4">
          Complétez votre profil entreprise depuis la section{' '}
          <a
            href="/profile"
            className="transition-colors duration-200"
            style={{ color: '#0EA5E9' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7DD3FC')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#0EA5E9')}
          >
            Profil entreprise
          </a>
        </p>
      </SectionCard>

      {/* ── Abonnement ──────────────────────────────────────────────────── */}
      <SectionCard icon={<CreditCard size={15} style={{ color: '#A78BFA' }} />} title="Abonnement">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: planCfg.bg, color: planCfg.color, border: `1px solid ${planCfg.border}` }}
              >
                {planCfg.label}
              </span>
              <span className="text-sm font-semibold text-ds-text">{planPrice}<span className="text-xs font-normal text-ds-text-3">/mois HT</span></span>
            </div>
            <p className="text-xs text-ds-text-3">
              {plan === 'free' ? 'Accès limité — passez à Pro pour débloquer toutes les fonctionnalités' : 'Toutes les fonctionnalités incluses'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #0EA5E9 0%, #00D4AA 100%)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
          >
            <span>Gérer mon abonnement</span>
            <ChevronRight size={16} />
          </button>

          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-ds-text-2 transition-all duration-200 hover:text-ds-text"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
          >
            <span>Historique de facturation</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

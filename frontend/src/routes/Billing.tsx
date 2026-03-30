import {
  CreditCard, ArrowRight, Download, Calendar, Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import PaymentCard from '@/components/common/PaymentCard'

const PLAN_LABELS: Record<string, { label: string; price: string; color: string; bg: string; border: string }> = {
  pro:      { label: 'Pro',      price: '249€', color: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)' },
  business: { label: 'Business', price: '399€', color: '#93C5FD', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.30)' },
  free:     { label: 'Gratuit',  price: '0€',   color: '#94A3B8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' },
}

const MOCK_INVOICES = [
  { date: '01/03/2026', description: 'Abonnement Pro — Mars 2026',   amount: '249,00 €', status: 'Payé' },
  { date: '01/02/2026', description: 'Abonnement Pro — Février 2026', amount: '249,00 €', status: 'Payé' },
  { date: '01/01/2026', description: 'Abonnement Pro — Janvier 2026', amount: '249,00 €', status: 'Payé' },
  { date: '01/12/2025', description: 'Abonnement Pro — Décembre 2025', amount: '249,00 €', status: 'Payé' },
]

export default function Billing() {
  const { organization } = useAuthStore()
  const plan = organization?.plan ?? 'free'
  const planCfg = PLAN_LABELS[plan] ?? PLAN_LABELS.free

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.18)' }}
        >
          <CreditCard size={18} style={{ color: '#3B82F6' }} />
        </div>
        <div>
          <h1 className="text-ds-text leading-tight">Facturation</h1>
          <p className="text-xs text-ds-text-3 mt-0.5">Gérez votre abonnement et vos paiements</p>
        </div>
      </div>

      {/* ── Mon abonnement ──────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(59,130,246,0.08)', background: 'rgba(59,130,246,0.02)' }}
        >
          <Sparkles size={15} style={{ color: '#3B82F6' }} />
          <h2 className="text-sm font-semibold text-ds-text">Mon abonnement</h2>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ background: planCfg.bg, color: planCfg.color, border: `1px solid ${planCfg.border}` }}
                >
                  {planCfg.label}
                </span>
                <span className="text-2xl font-bold text-white">
                  {planCfg.price}
                  <span className="text-sm font-normal text-ds-text-3">/mois HT</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: '#64748B' }}>
                <Calendar size={12} />
                <span>Prochain renouvellement : 1 avril 2026</span>
              </div>
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
            >
              Changer de plan
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Moyen de paiement ───────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(59,130,246,0.08)', background: 'rgba(59,130,246,0.02)' }}
        >
          <CreditCard size={15} style={{ color: '#60A5FA' }} />
          <h2 className="text-sm font-semibold text-ds-text">Moyen de paiement</h2>
        </div>
        <div className="px-6 py-5 flex items-start gap-6">
          <PaymentCard
            cardType="visa"
            lastFour="4242"
            holderName="OZDEM BAT"
            expiryDate="12/27"
          />
          <div className="flex flex-col gap-3 pt-2">
            <button
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94A3B8',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.color = '#E2E8F0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = '#94A3B8'
              }}
            >
              Modifier
            </button>
          </div>
        </div>
      </div>

      {/* ── Historique de facturation ────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(59,130,246,0.08)', background: 'rgba(59,130,246,0.02)' }}
        >
          <Download size={15} style={{ color: '#A78BFA' }} />
          <h2 className="text-sm font-semibold text-ds-text">Historique de facturation</h2>
        </div>
        <div className="px-6 py-2">
          <table className="table-dark w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Montant</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((inv, i) => (
                <tr key={i}>
                  <td className="text-ds-text-2">{inv.date}</td>
                  <td>{inv.description}</td>
                  <td className="font-medium">{inv.amount}</td>
                  <td>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: 'rgba(16,185,129,0.12)',
                        color: '#34D399',
                        border: '1px solid rgba(16,185,129,0.25)',
                      }}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                      style={{ color: '#64748B' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#94A3B8' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
                      title="Télécharger PDF"
                    >
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

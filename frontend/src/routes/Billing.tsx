import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CreditCard, ArrowRight, Download, Sparkles, Check, Zap, Crown, ExternalLink, CheckCircle2, Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import type { Organization } from '@/types'

const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    price: '349',
    icon: Zap,
    color: '#E4E9F2',
    colorLight: '#FFFFFF',
    bg: 'rgba(228,233,242,0.08)',
    border: 'rgba(228,233,242,0.25)',
    features: [
      'Analyse IA illimitée',
      'Matrice de conformité automatique',
      'Checklist candidature',
      'Génération mémoire technique IA',
      'Export Word (.docx)',
      'Coffre-fort documentaire',
      '5 projets simultanés',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '599',
    icon: Crown,
    color: '#F4F6FA',
    colorLight: '#9BA4B5',
    bg: 'rgba(0,0,0,0.45)',
    border: 'rgba(186,205,234,0.23)',
    popular: true,
    features: [
      'Tout le plan Pro, plus :',
      'Projets illimités',
      'Templates de mémoire personnalisés',
      'Multi-utilisateurs (5 comptes)',
      'Scoring IA des offres',
      'Support prioritaire',
      'Historique complet des AO',
    ],
  },
] as const

const PLAN_BADGES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pro:      { label: 'Pro',      color: '#E4E9F2', bg: 'rgba(228,233,242,0.10)',  border: 'rgba(228,233,242,0.25)' },
  business: { label: 'Business', color: '#F4F6FA', bg: 'rgba(0,0,0,0.45)', border: 'rgba(186,205,234,0.23)' },
  free:     { label: 'Gratuit',  color: '#9BA4B5', bg: '#1C222D', border: '#1C222D' },
}

export default function Billing() {
  const { organization, setOrganization } = useAuthStore()
  const plan = organization?.plan ?? 'free'
  const badge = PLAN_BADGES[plan] ?? PLAN_BADGES.free
  const isPaid = plan === 'pro' || plan === 'business'

  const [searchParams, setSearchParams] = useSearchParams()
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPlan, setSuccessPlan] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  // After Stripe redirect: verify session and poll until plan is updated
  useEffect(() => {
    const isSuccess = searchParams.get('success') === 'true'
    const sessionId = searchParams.get('session_id')

    if (!isSuccess || !sessionId) return

    // Clean URL immediately
    setSearchParams({}, { replace: true })
    setVerifying(true)
    pollCountRef.current = 0

    const verify = async () => {
      try {
        const { data } = await api.get<{ plan: string; updated: boolean }>(
          `/stripe/verify-session?session_id=${sessionId}`
        )
        if (data.updated && data.plan !== 'free') {
          // Plan updated — stop polling, update store
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          setVerifying(false)
          setSuccessPlan(data.plan)
          setShowSuccess(true)
          // Update organization in Zustand store so sidebar badge updates immediately
          if (organization) {
            setOrganization({ ...organization, plan: data.plan as Organization['plan'] })
          }
          setTimeout(() => setShowSuccess(false), 8000)
          return
        }
      } catch { /* ignore, will retry */ }

      pollCountRef.current++
      // Stop after 15 attempts (30s at 2s interval)
      if (pollCountRef.current >= 15) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setVerifying(false)
        // Show success anyway — Stripe payment went through, webhook will catch up
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 8000)
      }
    }

    // First attempt immediately
    verify()
    // Then poll every 2s
    pollRef.current = setInterval(verify, 2000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount only

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      const { data } = await api.post('/stripe/create-checkout-session', { plan: planId })
      window.location.href = data.url
    } catch {
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const { data } = await api.get('/stripe/portal')
      window.location.href = data.url
    } catch {
      setPortalLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(228,233,242,0.10)', border: '1px solid rgba(228,233,242,0.18)' }}
        >
          <CreditCard size={18} className="text-ds-cyan" />
        </div>
        <div>
          <h1 className="text-ds-text leading-tight">Facturation</h1>
          <p className="text-sm text-ds-text-2 mt-0.5">Gérez votre abonnement et vos paiements</p>
        </div>
      </div>

      {/* Verifying payment spinner */}
      {verifying && (
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-2xl animate-fade-in"
          style={{
            background: 'rgba(228,233,242,0.08)',
            border: '1px solid rgba(228,233,242,0.25)',
          }}
        >
          <Loader2 size={20} className="animate-spin text-ds-cyan" />
          <div>
            <p className="text-sm font-semibold text-ds-cyan">Vérification du paiement...</p>
            <p className="text-xs text-ds-text-3 mt-0.5">Confirmation en cours, veuillez patienter.</p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {showSuccess && !verifying && (
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-2xl animate-fade-in"
          style={{
            background: 'rgba(228,233,242,0.08)',
            border: '1px solid rgba(228,233,242,0.25)',
          }}
        >
          <CheckCircle2 size={20} className="text-ds-cyan" />
          <div>
            <p className="text-sm font-semibold text-ds-cyan-dark">
              Paiement réussi !
            </p>
            <p className="text-xs text-ds-text-3 mt-0.5">
              {successPlan
                ? `Votre plan ${successPlan === 'pro' ? 'Pro' : 'Business'} est maintenant actif.`
                : 'Votre abonnement est maintenant actif.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Mon abonnement ──────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(228,233,242,0.08)', background: 'rgba(228,233,242,0.02)' }}
        >
          <Sparkles size={15} className="text-ds-cyan" />
          <h2 className="text-sm font-semibold text-ds-text">Mon abonnement</h2>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                >
                  {badge.label}
                </span>
                {isPaid && (
                  <span className="text-2xl font-bold text-ds-text">
                    {plan === 'pro' ? '349€' : '599€'}
                    <span className="text-sm font-normal text-ds-text-3">/mois HT</span>
                  </span>
                )}
                {!isPaid && (
                  <span className="text-sm text-ds-text-3">
                    Aucun abonnement actif
                  </span>
                )}
              </div>
            </div>
            {isPaid && (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: '#1C222D',
                  border: '1px solid rgba(186,205,234,.13)',
                  color: '#9BA4B5',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1C222D'
                  e.currentTarget.style.color = '#F4F6FA'
                  e.currentTarget.style.borderColor = '#5C6678'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#1C222D'
                  e.currentTarget.style.color = '#9BA4B5'
                  e.currentTarget.style.borderColor = '#1C222D'
                }}
              >
                {portalLoading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                ) : (
                  <ExternalLink size={14} />
                )}
                Gérer mon abonnement
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Plans (show for free users, or to change plan) ─── */}
      {!isPaid && (
        <div className="glass-card overflow-hidden">
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{ borderBottom: '1px solid rgba(228,233,242,0.08)', background: 'rgba(228,233,242,0.02)' }}
          >
            <Sparkles size={15} className="text-ds-cyan" />
            <h2 className="text-sm font-semibold text-ds-text">Choisir un plan</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-6">
            {PLANS.map((p) => {
              const Icon = p.icon
              const isLoading = loading === p.id
              return (
                <div
                  key={p.id}
                  className="relative flex flex-col rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    background: p.bg,
                    border: `1px solid ${p.border}`,
                    boxShadow: `0 0 24px ${p.bg}`,
                  }}
                >
                  {'popular' in p && p.popular && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-0.5 rounded-full"
                      style={{
                        background: '#E4E9F2',
                        color: '#0A0C11',
                        boxShadow: '0 8px 24px -12px rgba(228,233,242,0.55)',
                      }}
                    >
                      Populaire
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${p.color}20`, border: `1px solid ${p.color}40` }}
                    >
                      <Icon size={16} style={{ color: p.color }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: p.colorLight }}>
                      {p.name}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-ds-text">{p.price}€</span>
                    <span className="text-sm text-ds-text-3">/mois HT</span>
                  </div>

                  <ul className="space-y-2 mb-5 flex-1">
                    {p.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Check size={12} className="shrink-0 mt-0.5" style={{ color: p.color }} />
                        <span className="text-ds-text-2">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(p.id)}
                    disabled={isLoading}
                    className="edge-cta w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <>S'abonner <ArrowRight size={14} /></>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="text-center px-6 pb-5">
            <p className="text-xs text-ds-text-3">
              Annulation possible à tout moment. Facturation mensuelle sans engagement.
            </p>
          </div>
        </div>
      )}

      {/* ── Historique de facturation ────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(228,233,242,0.08)', background: 'rgba(228,233,242,0.02)' }}
        >
          <Download size={15} className="text-ds-cyan" />
          <h2 className="text-sm font-semibold text-ds-text">Historique de facturation</h2>
        </div>
        <div className="px-6 py-5">
          {isPaid ? (
            <p className="text-sm text-ds-text-3">
              Consultez vos factures via le{' '}
              <button
                onClick={handlePortal}
                className="text-ds-cyan hover:text-ds-cyan-dark underline underline-offset-2 transition-colors"
              >
                portail Stripe
              </button>.
            </p>
          ) : (
            <p className="text-sm text-ds-text-3">
              Aucune facture pour le moment.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

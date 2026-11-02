import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CreditCard, ArrowRight, Download, Sparkles, ExternalLink, CheckCircle2, Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import type { Organization } from '@/types'
import GrilleOffres from '@/components/offres/GrilleOffres'
import { nomPlan, prixLibelle, trouverOffre } from '@/lib/offres'

// Jetons du système (clair et nuit) : aucune couleur écrite en dur, l'écran suit le thème (C11).
const BADGE_ACCENT = { color: 'var(--accent-text)', bg: 'var(--accent-tint)', border: 'var(--accent-ring)' }
const PLAN_BADGES: Record<string, { color: string; bg: string; border: string }> = {
  essentiel: BADGE_ACCENT,
  pro:       BADGE_ACCENT,
  business:  BADGE_ACCENT,
  free:      { color: 'var(--text-2)', bg: 'var(--surface-2)', border: 'var(--border-1)' },
}

const PASTILLE_ICONE = { background: 'var(--surface-2)', border: '1px solid var(--border-1)' } as const
const ENTETE_CARTE = { borderBottom: '1px solid var(--border-1)', background: 'var(--surface-1)' } as const
const BANDEAU_ACCENT = { background: 'var(--accent-tint)', border: '1px solid var(--accent-ring)' } as const

export default function Billing() {
  const { organization, setOrganization } = useAuthStore()
  const plan = organization?.plan ?? 'free'
  const badge = PLAN_BADGES[plan] ?? PLAN_BADGES.free
  const offreActive = trouverOffre(plan)
  const isPaid = offreActive !== undefined

  const [searchParams, setSearchParams] = useSearchParams()
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPlan, setSuccessPlan] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
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
    setErreur(null)
    try {
      const { data } = await api.post('/stripe/create-checkout-session', { plan: planId })
      window.location.href = data.url
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      setErreur(typeof detail === 'string' ? detail : "Le paiement n'a pas pu démarrer. Réessayez dans un instant.")
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
          style={PASTILLE_ICONE}
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
          style={BANDEAU_ACCENT}
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
          style={BANDEAU_ACCENT}
        >
          <CheckCircle2 size={20} className="text-ds-cyan" />
          <div>
            <p className="text-sm font-semibold text-ds-cyan-dark">
              Paiement réussi
            </p>
            <p className="text-xs text-ds-text-3 mt-0.5">
              {successPlan
                ? `Votre offre ${nomPlan(successPlan)} est maintenant active.`
                : 'Votre abonnement est maintenant actif.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Mon abonnement ──────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={ENTETE_CARTE}
        >
          <Sparkles size={15} className="text-ds-cyan" />
          <h2 className="text-sm font-semibold text-ds-text">Mon abonnement</h2>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                >
                  {nomPlan(plan)}
                </span>
                {offreActive && (
                  <span className="whitespace-nowrap text-2xl font-bold text-ds-text">
                    {prixLibelle(offreActive)}
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
                className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-fg-2 transition-all duration-200 hover:border-bord-2 hover:text-fg"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)' }}
              >
                {portalLoading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-fg-3 border-t-fg animate-spin" />
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
            style={ENTETE_CARTE}
          >
            <Sparkles size={15} className="text-ds-cyan" />
            <h2 className="text-sm font-semibold text-ds-text">Choisir une offre</h2>
          </div>
          <div className="px-6 py-6">
            <GrilleOffres
              compacte
              action={(offre) => (
                <button
                  onClick={() => handleSubscribe(offre.id)}
                  disabled={loading === offre.id}
                  className="edge-cta w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {loading === offre.id ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <>S'abonner <ArrowRight size={14} /></>
                  )}
                </button>
              )}
            />
            {erreur && (
              <p role="alert" className="mt-3 text-sm text-center" style={{ color: 'var(--warning-fg)' }}>{erreur}</p>
            )}
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
          style={ENTETE_CARTE}
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

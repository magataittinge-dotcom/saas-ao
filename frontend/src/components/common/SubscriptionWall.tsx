import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import { api } from '@/services/api'
import GrilleOffres from '@/components/offres/GrilleOffres'

interface Props {
  open: boolean
  onClose: () => void
  feature?: 'analysis' | 'memoire'
  /** Refus du serveur (402) à afficher tel quel : c'est lui qui applique le quota. */
  message?: string | null
}

const FEATURE_LABELS: Record<string, string> = {
  analysis: "L'analyse IA de votre dossier de l'acheteur",
  memoire: 'La génération du mémoire technique',
}

export default function SubscriptionWall({ open, onClose, feature = 'analysis', message }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

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

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'color-mix(in srgb, var(--surface-0) 90%, transparent)',
          backdropFilter: 'none',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-3xl animate-fade-in overflow-y-auto"
        style={{
          background: 'var(--edge-panel-light), var(--edge-panel)',
          backdropFilter: 'blur(32px) saturate(140%)',
          border: '1px solid var(--border-1)',
          borderRadius: '24px',
          boxShadow: '0 0 80px color-mix(in srgb, var(--text-1) 8%, transparent), 0 24px 60px color-mix(in srgb, var(--surface-dark) 45%, transparent)',
          maxHeight: '95vh',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-surface-1 z-10 text-ds-text-2"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="text-center px-6 pt-6 pb-1">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--text-1) 20%, transparent), color-mix(in srgb, var(--text-1) 10%, transparent))',
              border: '1px solid var(--border-2)',
              boxShadow: '0 0 30px color-mix(in srgb, var(--text-1) 15%, transparent)',
            }}
          >
            <Sparkles size={22} className="text-ds-cyan" />
          </div>
          <h2 className="text-lg font-bold text-ds-text">
            Passez au niveau supérieur
          </h2>
          <p role="status" className="text-sm text-ds-text-2 mt-1.5 max-w-lg mx-auto">
            {message ?? `${FEATURE_LABELS[feature] ?? 'Cette fonctionnalité'} demande une offre active. Choisissez celle qui suit votre rythme.`}
          </p>
        </div>

        {/* Offres — la grille unique (lib/offres.ts) */}
        <div className="px-6 py-5">
          <GrilleOffres
            compacte
            action={(offre) => (
              <button
                onClick={() => handleSubscribe(offre.id)}
                disabled={loading === offre.id}
                className="edge-cta w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                {loading === offre.id ? (
                  <span className="w-4 h-4 rounded-full border-2 border-accent-on/30 border-t-accent-on animate-spin" />
                ) : (
                  `Choisir ${offre.nom}`
                )}
              </button>
            )}
          />
          {erreur && (
            <p role="alert" className="mt-3 text-sm text-center" style={{ color: 'var(--warning-fg)' }}>{erreur}</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center px-6 pb-5">
          <p className="text-xs text-ds-text-3">
            Annulation possible à tout moment. Facturation mensuelle sans engagement.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

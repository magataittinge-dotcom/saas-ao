import { useEffect, useState, useCallback } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastData {
  id: string
  message: string
  variant: ToastVariant
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof CheckCircle2; color: string; bg: string; border: string; barColor: string }> = {
  success: {
    icon: CheckCircle2,
    color: '#059669',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.20)',
    barColor: '#10B981',
  },
  error: {
    icon: XCircle,
    color: '#DC2626',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.20)',
    barColor: '#EF4444',
  },
  info: {
    icon: Info,
    color: '#059669',
    bg: 'rgba(14,165,233,0.08)',
    border: 'rgba(14,165,233,0.20)',
    barColor: '#0EA5E9',
  },
  warning: {
    icon: AlertTriangle,
    color: '#FBBF24',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.20)',
    barColor: '#F59E0B',
  },
}

const DURATION = 4000

function ToastItem({ toast, onRemove }: { toast: ToastData; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)
  const cfg = VARIANT_CONFIG[toast.variant]
  const Icon = cfg.icon

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }, [onRemove, toast.id])

  useEffect(() => {
    const timer = setTimeout(dismiss, DURATION)
    return () => clearTimeout(timer)
  }, [dismiss])

  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-lg backdrop-blur-xl transition-all duration-300"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        minWidth: 320,
        maxWidth: 420,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(100%)' : 'translateX(0)',
        animation: 'toast-slide-in 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={18} style={{ color: cfg.color }} className="shrink-0" />
        <p className="text-sm text-white/90 flex-1">{toast.message}</p>
        <button
          onClick={dismiss}
          className="p-1 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: '#64748B' }}
        >
          <X size={14} />
        </button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: '#F1F5F9' }}>
        <div
          className="h-full"
          style={{
            background: cfg.barColor,
            animation: `toast-progress ${DURATION}ms linear forwards`,
          }}
        />
      </div>
    </div>
  )
}

// ── Toast container (render once in Layout or App) ──
let toastListener: ((t: ToastData) => void) | null = null

export function toast(message: string, variant: ToastVariant = 'info') {
  const id = Math.random().toString(36).slice(2)
  toastListener?.({ id, message, variant })
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  useEffect(() => {
    toastListener = (t) => setToasts((prev) => [...prev, t])
    return () => { toastListener = null }
  }, [])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/services/api'

interface StepInfo {
  name: string
  status: 'pending' | 'in_progress' | 'completed'
  duration_s?: number
  started_at?: number
}

interface PipelineStatus {
  status: string
  progress: number
  current_step: string
  steps: StepInfo[]
  estimated_remaining_s: number
  started_at: number | null
  elapsed_s: number
  pipeline_type: string
  detail?: string
}

interface Props {
  projectId: string
  active: boolean
  onComplete: () => void
  onCancel?: () => void
  subtitle?: string
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) return `~${Math.ceil(seconds)}s restantes`
  const min = Math.ceil(seconds / 60)
  return `~${min} min restante${min > 1 ? 's' : ''}`
}

export function PipelineProgress({
  projectId,
  active,
  onComplete,
  onCancel,
  subtitle,
}: Props) {
  const [data, setData] = useState<PipelineStatus | null>(null)
  const [displayProgress, setDisplayProgress] = useState(0)
  const [showCheck, setShowCheck] = useState(false)
  const [isError, setIsError] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)
  const targetProgressRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)

  // Smooth animation: lerp displayProgress toward target
  useEffect(() => {
    let running = true
    const animate = () => {
      if (!running) return
      setDisplayProgress(prev => {
        const target = targetProgressRef.current
        if (Math.abs(prev - target) < 0.5) return target
        return prev + (target - prev) * 0.12
      })
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Polling
  useEffect(() => {
    if (!active) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    completedRef.current = false
    setShowCheck(false)
    setIsError(false)
    setDisplayProgress(0)
    targetProgressRef.current = 0

    const poll = async () => {
      if (completedRef.current) return
      try {
        const { data: status } = await api.get<PipelineStatus>(
          `/projects/${projectId}/processing-status`
        )
        setData(status)
        targetProgressRef.current = status.progress

        if (status.status === 'completed') {
          completedRef.current = true
          targetProgressRef.current = 100
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          setTimeout(() => setShowCheck(true), 300)
          setTimeout(() => onComplete(), 1600)
        } else if (status.status === 'error') {
          completedRef.current = true
          setIsError(true)
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch { /* ignore poll errors */ }
    }

    // Initial fetch
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [active, projectId, onComplete])

  if (!active) return null

  const steps = data?.steps ?? []
  const currentStep = data?.current_step ?? subtitle ?? 'Initialisation...'
  const remaining = data?.estimated_remaining_s ?? 0
  const progress = Math.round(displayProgress)

  const RADIUS = 80
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const offset = CIRCUMFERENCE * (1 - Math.min(progress, 100) / 100)

  const accentColor = showCheck ? '#0EA5E9' : isError ? '#EF4444' : '#0EA5E9'

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'rgba(6,9,15,0.92)',
        backdropFilter: 'none',
      }}
    >
      <div
        className="flex flex-col items-center gap-6 w-full max-w-md mx-4 p-10 rounded-2xl"
        style={{
          background: '#FFFFFF',
          border: `1px solid rgba(14,165,233,0.15)`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(14,165,233,0.08)',
        }}
      >
        {/* Radial progress */}
        <div className="relative w-48 h-48">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke="rgba(100,116,139,0.12)"
              strokeWidth="10"
            />
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke={accentColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke 0.3s ease',
                filter: `drop-shadow(0 0 10px ${accentColor})`,
              }}
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            {showCheck ? (
              <div
                className="flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'rgba(16,185,129,0.15)', animation: 'scale-in 0.3s ease forwards' }}
              >
                <Check size={36} className="text-ds-success" strokeWidth={2.5} />
              </div>
            ) : isError ? (
              <div
                className="flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)' }}
              >
                <AlertTriangle size={32} className="text-ds-danger" strokeWidth={2} />
              </div>
            ) : (
              <span
                className="text-4xl font-bold tabular-nums font-mono text-ds-text"
              >
                {progress}%
              </span>
            )}
          </div>

          {/* Pulse ring */}
          {!showCheck && !isError && (
            <div
              className="absolute inset-2 rounded-full"
              style={{
                border: `2px solid ${accentColor}`,
                opacity: 0.1,
                animation: 'pulse-ring 2s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Current step label */}
        <div className="text-center space-y-1.5">
          <p className="text-base font-semibold text-ds-text">
            {isError ? 'Erreur' : currentStep}
          </p>
          {!showCheck && !isError && remaining > 0 && (
            <p
              className="flex items-center justify-center gap-1.5 text-sm text-ds-text-2"
            >
              <Clock size={13} />
              {formatRemaining(remaining)}
            </p>
          )}
          {isError && (
            <p className="text-sm text-ds-danger-light">
              {data?.current_step || "Une erreur est survenue"}
            </p>
          )}
        </div>

        {/* Step list */}
        {steps.length > 0 && (
          <div className="w-full space-y-2 pt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {/* Step icon */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {step.status === 'completed' ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(16,185,129,0.15)' }}
                    >
                      <Check size={12} className="text-ds-success" strokeWidth={3} />
                    </div>
                  ) : step.status === 'in_progress' ? (
                    <div className="relative w-5 h-5">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          border: '2px solid #0EA5E9',
                          borderTopColor: 'transparent',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: 'rgba(100,116,139,0.3)' }}
                    />
                  )}
                </div>

                {/* Step label */}
                <span
                  className="text-sm flex-1"
                  style={{
                    color: step.status === 'completed'
                      ? '#94A3B8'
                      : step.status === 'in_progress'
                        ? '#E2E8F0'
                        : '#475569',
                    fontWeight: step.status === 'in_progress' ? 500 : 400,
                  }}
                >
                  {step.name}
                </span>

                {/* Duration */}
                {step.status === 'completed' && step.duration_s != null && (
                  <span
                    className="text-xs tabular-nums shrink-0 font-mono text-ds-text-3"
                  >
                    {step.duration_s < 60
                      ? `${Math.round(step.duration_s)}s`
                      : `${Math.floor(step.duration_s / 60)}m${Math.round(step.duration_s % 60)}s`
                    }
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Cancel button */}
        {!showCheck && onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200 mt-2"
            style={{
              color: 'rgba(148,163,184,0.8)',
              background: 'rgba(100,116,139,0.08)',
              border: '1px solid rgba(100,116,139,0.15)',
            }}
          >
            <X size={14} />
            Annuler
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* Unified progress display. Used by every long-running flow:
 * upload, lot detection, AI analysis, mémoire generation.
 *
 * Visual: identical to the legacy PipelineProgress (cyan SVG circle with
 * stroke-dashoffset, lerp animation toward target progress, pulse-ring,
 * confettis on success). The only thing this component does differently
 * is accept its data via props instead of polling /processing-status —
 * the parent owns the data source (typically `useProgressStream`).
 *
 * Props:
 *   - variant       : "modal" (fullscreen overlay) or "inline" (in-page)
 *   - steps         : ordered list of step descriptors (matches backend)
 *   - currentStep   : key of the in-progress step
 *   - progress      : 0-100, already smoothed by the caller
 *   - detail        : line of detail under the circle ("Détection des lots…")
 *   - phase         : pending / in_progress / complete / error
 *   - title         : optional title above the steps list
 *   - onCancel      : optional → renders a Cancel button
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface StepDescriptor {
  key: string
  label: string
  estimated_s?: number
  icon?: LucideIcon
}

type Phase = 'pending' | 'in_progress' | 'complete' | 'error'
type Variant = 'modal' | 'inline'

interface Props {
  steps: StepDescriptor[]
  currentStep: string | null
  progress: number
  detail?: string
  phase?: Phase
  variant?: Variant
  title?: string
  onCancel?: () => void
}

export default function ProgressDisplay({
  steps,
  currentStep,
  progress,
  detail = '',
  phase = 'in_progress',
  variant = 'inline',
  title,
  onCancel,
}: Props) {
  const [displayProgress, setDisplayProgress] = useState(0)
  const targetProgressRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)
  const [showCheck, setShowCheck] = useState(false)

  // Lerp animation: smoothly approach the target % so server jitter
  // doesn't make the bar twitch.
  useEffect(() => {
    let running = true
    const animate = () => {
      if (!running) return
      setDisplayProgress((prev) => {
        const target = targetProgressRef.current
        if (Math.abs(prev - target) < 0.4) return target
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

  // Drive the lerp target from the prop.
  useEffect(() => {
    if (phase === 'complete') {
      targetProgressRef.current = 100
    } else {
      targetProgressRef.current = Math.max(0, Math.min(progress, 99))
    }
  }, [progress, phase])

  // Gate the success check + confetti to play after the bar fills.
  useEffect(() => {
    if (phase === 'complete') {
      const t = setTimeout(() => setShowCheck(true), 450)
      return () => clearTimeout(t)
    }
    setShowCheck(false)
  }, [phase])

  const isError = phase === 'error'
  const RADIUS = variant === 'modal' ? 80 : 70
  const STROKE = variant === 'modal' ? 10 : 8
  const VIEWBOX = (RADIUS + STROKE) * 2
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const renderProgress = Math.round(Math.max(0, Math.min(displayProgress, 100)))
  const offset = CIRCUMFERENCE * (1 - renderProgress / 100)

  const accentColor = isError ? '#EF4444' : '#0EA5E9'

  // Inline-mode: small page-level block. Modal: fullscreen overlay portal.
  const body = (
    <div
      className={
        variant === 'modal'
          ? 'flex flex-col items-center gap-6 w-full max-w-md mx-4 p-10 rounded-2xl'
          : 'flex flex-col items-center gap-5'
      }
      style={
        variant === 'modal'
          ? {
              background: '#FFFFFF',
              border: '1px solid rgba(14,165,233,0.15)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(14,165,233,0.08)',
            }
          : undefined
      }
    >
      {/* Circle */}
      <div
        className="relative"
        style={{ width: variant === 'modal' ? 200 : 160, height: variant === 'modal' ? 200 : 160 }}
      >
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        >
          <circle
            cx={VIEWBOX / 2}
            cy={VIEWBOX / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(100,116,139,0.12)"
            strokeWidth={STROKE}
          />
          <circle
            cx={VIEWBOX / 2}
            cy={VIEWBOX / 2}
            r={RADIUS}
            fill="none"
            stroke={accentColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke 0.3s ease',
              filter: `drop-shadow(0 0 ${variant === 'modal' ? 10 : 8}px ${accentColor})`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {showCheck ? (
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: variant === 'modal' ? 64 : 56,
                height: variant === 'modal' ? 64 : 56,
                background: 'rgba(16,185,129,0.15)',
                animation: 'scale-in 0.3s ease forwards',
              }}
            >
              <Check size={variant === 'modal' ? 36 : 32} className="text-ds-success" strokeWidth={2.5} />
            </div>
          ) : isError ? (
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: variant === 'modal' ? 64 : 56,
                height: variant === 'modal' ? 64 : 56,
                background: 'rgba(239,68,68,0.15)',
              }}
            >
              <AlertTriangle size={variant === 'modal' ? 32 : 28} className="text-ds-danger" strokeWidth={2} />
            </div>
          ) : (
            <span
              className={
                variant === 'modal'
                  ? 'text-4xl font-bold tabular-nums font-mono text-ds-text'
                  : 'text-2xl font-bold tabular-nums font-mono'
              }
              style={variant === 'inline' ? { color: accentColor } : undefined}
            >
              {renderProgress}%
            </span>
          )}
        </div>
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

      {/* Title + detail */}
      <div className="text-center space-y-1.5">
        {title && (
          <p className={variant === 'modal' ? 'text-lg font-bold text-ds-text' : 'text-sm font-bold text-ds-text'}>
            {title}
          </p>
        )}
        <p
          className={
            variant === 'modal'
              ? 'text-base font-semibold text-ds-text'
              : 'text-sm font-medium text-ds-text'
          }
        >
          {isError ? 'Erreur' : detail || currentStep || ''}
        </p>
      </div>

      {/* Step list (modal only — too heavy for inline) */}
      {variant === 'modal' && steps.length > 0 && (
        <div className="w-full space-y-2 pt-2">
          {steps.map((step) => {
            const stepStatus =
              phase === 'complete'
                ? 'completed'
                : step.key === currentStep
                  ? 'in_progress'
                  : isStepBefore(step.key, currentStep, steps)
                    ? 'completed'
                    : 'pending'
            const Icon = step.icon
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {stepStatus === 'completed' ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(16,185,129,0.15)' }}
                    >
                      <Check size={12} className="text-ds-success" strokeWidth={3} />
                    </div>
                  ) : stepStatus === 'in_progress' ? (
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
                  ) : Icon ? (
                    <Icon size={14} style={{ color: '#94A3B8' }} />
                  ) : (
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: 'rgba(100,116,139,0.3)' }}
                    />
                  )}
                </div>
                <span
                  className="text-sm flex-1"
                  style={{
                    color:
                      stepStatus === 'completed'
                        ? '#94A3B8'
                        : stepStatus === 'in_progress'
                          ? '#0F172A'
                          : '#475569',
                    fontWeight: stepStatus === 'in_progress' ? 600 : 400,
                  }}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel button */}
      {!showCheck && !isError && onCancel && (
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200 mt-2"
          style={{
            color: 'rgba(148,163,184,0.8)',
            background: 'rgba(100,116,139,0.08)',
            border: '1px solid rgba(100,116,139,0.15)',
          }}
        >
          <X size={14} /> Annuler
        </button>
      )}
    </div>
  )

  if (variant === 'modal') {
    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{
          background: 'rgba(6,9,15,0.92)',
        }}
      >
        {body}
      </div>,
      document.body,
    )
  }
  return body
}

function isStepBefore(
  candidate: string,
  current: string | null,
  steps: StepDescriptor[],
): boolean {
  if (!current) return false
  const candIdx = steps.findIndex((s) => s.key === candidate)
  const curIdx = steps.findIndex((s) => s.key === current)
  if (candIdx === -1 || curIdx === -1) return false
  return candIdx < curIdx
}

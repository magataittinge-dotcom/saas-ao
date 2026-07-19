import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'

export interface ProgressStage {
  upTo: number
  message: string
  msPerStep: number
}

const DEFAULT_STAGES: ProgressStage[] = [
  { upTo: 20, message: 'Extraction du texte...', msPerStep: 120 },
  { upTo: 60, message: 'Analyse IA en cours...', msPerStep: 380 },
  { upTo: 90, message: 'Extraction des exigences...', msPerStep: 300 },
  { upTo: 99, message: 'Finalisation...', msPerStep: 2800 },
]

export const MEMOIRE_STAGES: ProgressStage[] = [
  { upTo: 5,  message: 'Lecture des documents DCE...', msPerStep: 300 },
  { upTo: 15, message: 'Analyse du contexte projet...', msPerStep: 800 },
  { upTo: 70, message: 'Rédaction par Synorix IA...', msPerStep: 1800 },
  { upTo: 90, message: 'Structuration des sections...', msPerStep: 2200 },
  { upTo: 99, message: 'Finalisation du mémoire...', msPerStep: 6000 },
]

/** Seconds before showing "taking longer than expected" hint */
const SLOW_THRESHOLD_S = 120

interface Props {
  isAnalyzing: boolean
  isSuccess: boolean
  onComplete: () => void
  onCancel?: () => void
  stages?: ProgressStage[]
  subtitle?: string
  preparation?: { extracted: number; total: number } | null
}

export function AnalysisProgress({
  isAnalyzing,
  isSuccess,
  onComplete,
  onCancel,
  stages = DEFAULT_STAGES,
  subtitle = "L'IA analyse vos documents DCE...",
  preparation = null,
}: Props) {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState(stages[0]?.message ?? '')
  const [showCheck, setShowCheck] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prepDone = !preparation || preparation.extracted >= preparation.total

  // ── Slow detection: show hint after SLOW_THRESHOLD_S at 99% ───────────────
  useEffect(() => {
    if (!isAnalyzing) {
      setIsSlow(false)
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
      return
    }
    slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_S * 1000)
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [isAnalyzing])

  // Reset slow when success
  useEffect(() => {
    if (isSuccess) setIsSlow(false)
  }, [isSuccess])

  // ── Preparation phase: real progress from backend ─────────────────────────
  useEffect(() => {
    if (!isAnalyzing || prepDone) return
    const pct = Math.round((preparation!.extracted / Math.max(preparation!.total, 1)) * 100)
    const displayPct = Math.min(Math.round(pct * 0.15), 15)
    setProgress(displayPct)
    setMessage(`Préparation des documents... ${preparation!.extracted}/${preparation!.total} prêts`)
  }, [isAnalyzing, preparation, prepDone])

  // ── Analysis phase: animated fake progress ────────────────────────────────
  useEffect(() => {
    if (!isAnalyzing || !prepDone) return
    setProgress(0)
    setShowCheck(false)
    setMessage(stages[0]?.message ?? '')

    let current = 0
    const tick = () => {
      current += 1
      setProgress(current)
      const stage = stages.find((s) => current <= s.upTo) ?? stages[stages.length - 1]
      setMessage(stage.message)
      if (current < 99) {
        const nextStage = stages.find((s) => current < s.upTo) ?? stages[stages.length - 1]
        timerRef.current = setTimeout(tick, nextStage.msPerStep)
      }
    }
    timerRef.current = setTimeout(tick, stages[0]?.msPerStep ?? 200)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnalyzing, prepDone])

  useEffect(() => {
    if (!isSuccess) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setProgress(100)
    setMessage('Terminé !')
    const t1 = setTimeout(() => setShowCheck(true), 200)
    const t2 = setTimeout(() => onComplete(), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isSuccess, onComplete])

  if (!isAnalyzing && !isSuccess) return null

  const RADIUS = 80
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const offset = CIRCUMFERENCE * (1 - progress / 100)

  return createPortal(
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,12,17,0.85)', backdropFilter: 'none',
      }}
    >
      <div
        className="flex flex-col items-center gap-6 min-w-72 p-10 rounded-2xl"
        style={{
          background: '#151A23',
          border: '1px solid rgba(228,233,242,0.20)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(228,233,242,0.10)',
        }}
      >
        {/* Radial progress */}
        <div className="relative w-48 h-48">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgba(120,130,149,0.20)" strokeWidth="10" />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={showCheck ? '#E4E9F2' : '#E4E9F2'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease', filter: `drop-shadow(0 0 8px ${showCheck ? '#E4E9F2' : '#E4E9F2'})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {showCheck ? (
              <div
                className="flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'rgba(228,233,242,0.15)' }}
              >
                <Check size={36} className="text-ds-cyan" strokeWidth={2.5} />
              </div>
            ) : (
              <span
                className="text-4xl font-bold font-mono text-ds-text"
              >
                {progress}%
              </span>
            )}
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-ds-text">{message}</p>
          {!showCheck && (
            <p className="text-sm text-ds-text-2">
              {!prepDone
                ? 'Extraction en cours, veuillez patienter...'
                : isSlow
                  ? "L'analyse prend plus de temps que prévu. Veuillez patienter..."
                  : subtitle}
            </p>
          )}
        </div>

        {/* Cancel button — visible after slow threshold or always if onCancel provided */}
        {!showCheck && onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200"
            style={{
              color: '#9BA4B5',
              background: 'rgba(120,130,149,0.10)',
              border: '1px solid rgba(120,130,149,0.20)',
              opacity: isSlow ? 1 : 0.5,
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

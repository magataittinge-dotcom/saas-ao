import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useCompanionStore } from '@/stores/companionStore'
import CompanionOrb from '@/components/ui/CompanionOrb'

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
  { upTo: 5,  message: 'Lecture des documents de l\'acheteur...', msPerStep: 300 },
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

/**
 * Modale d'analyse — le Compagnon travaille au centre de l'anneau :
 * boucle neuronale pendant l'analyse, vague ambre au succès.
 * Pilote le companionStore global (le header et le stepper suivent).
 */
export function AnalysisProgress({
  isAnalyzing,
  isSuccess,
  onComplete,
  onCancel,
  stages = DEFAULT_STAGES,
  subtitle = "L'IA analyse les documents de l'acheteur...",
  preparation = null,
}: Props) {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState(stages[0]?.message ?? '')
  const [showCheck, setShowCheck] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prepDone = !preparation || preparation.extracted >= preparation.total

  // ── Le Compagnon suit l'analyse (état global : header + stepper) ──────────
  useEffect(() => {
    if (isAnalyzing) useCompanionStore.getState().analyse()
  }, [isAnalyzing])
  useEffect(() => {
    if (isSuccess) useCompanionStore.getState().succeed()
  }, [isSuccess])
  useEffect(() => () => { useCompanionStore.getState().idle() }, [])

  // ── Slow detection: show hint after SLOW_THRESHOLD_S ──────────────────────
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
    const t2 = setTimeout(() => onComplete(), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isSuccess, onComplete])

  if (!isAnalyzing && !isSuccess) return null

  const RADIUS = 100
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const offset = CIRCUMFERENCE * (1 - progress / 100)

  return createPortal(
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--surface-0) 85%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="flex flex-col items-center gap-5 min-w-72 p-10 rounded-2xl top-lit"
        style={{
          background: 'var(--surface-1)',
          backgroundImage: 'var(--bottom-lit)',
          border: '1px solid var(--line-strong)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        {/* Le Compagnon au travail, ceint de l'anneau de progression */}
        <div className="relative h-56 w-56">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 224 224">
            <circle cx="112" cy="112" r={RADIUS} fill="none" stroke="var(--border-1)" strokeWidth="5" />
            <circle
              cx="112"
              cy="112"
              r={RADIUS}
              fill="none"
              stroke="var(--text-1)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 0.4s ease',
                filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--text-1) 45%, transparent))',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <CompanionOrb state={showCheck ? 'succes' : 'analyse'} size={172} zoom={1.02} />
          </div>
        </div>

        <div className="space-y-1 text-center">
          <p className="num-mono text-2xl font-bold text-ds-text">{progress}%</p>
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
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-200"
            style={{
              color: 'var(--text-3)',
              background: 'color-mix(in srgb, var(--text-3) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--text-3) 20%, transparent)',
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

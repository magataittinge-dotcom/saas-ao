import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

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
  { upTo: 70, message: 'Rédaction par Claude Opus...', msPerStep: 1800 },
  { upTo: 90, message: 'Structuration des sections...', msPerStep: 2200 },
  { upTo: 99, message: 'Finalisation du mémoire...', msPerStep: 6000 },
]

interface Props {
  isAnalyzing: boolean
  isSuccess: boolean
  onComplete: () => void
  stages?: ProgressStage[]
  subtitle?: string
}

export function AnalysisProgress({
  isAnalyzing,
  isSuccess,
  onComplete,
  stages = DEFAULT_STAGES,
  subtitle = "L'IA analyse vos documents DCE...",
}: Props) {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState(stages[0]?.message ?? '')
  const [showCheck, setShowCheck] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAnalyzing) return
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
  }, [isAnalyzing])

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(8,11,18,0.75)' }}>
      <div
        className="flex flex-col items-center gap-6 min-w-72 p-10 rounded-2xl"
        style={{
          background: 'rgba(15,23,42,0.95)',
          border: '1px solid rgba(59,130,246,0.20)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.10)',
        }}
      >
        {/* Radial progress */}
        <div className="relative w-48 h-48">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgba(100,116,139,0.20)" strokeWidth="10" />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={showCheck ? '#60A5FA' : '#3B82F6'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease', filter: `drop-shadow(0 0 8px ${showCheck ? '#60A5FA' : '#3B82F6'})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {showCheck ? (
              <div
                className="flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'rgba(96,165,250,0.15)' }}
              >
                <Check size={36} style={{ color: '#60A5FA' }} strokeWidth={2.5} />
              </div>
            ) : (
              <span
                className="text-4xl font-bold"
                style={{ fontFamily: '"JetBrains Mono", monospace', color: '#E2E8F0' }}
              >
                {progress}%
              </span>
            )}
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-ds-text">{message}</p>
          {!showCheck && <p className="text-sm text-ds-text-2">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

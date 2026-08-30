import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useCompanionStore } from '@/stores/companionStore'
import CompanionOrb from '@/components/ui/CompanionOrb'

const STEPS = [
  { number: 1, label: 'Upload DCE',  segment: 'upload' },
  { number: 2, label: 'Lots',        segment: 'lots' },
  { number: 3, label: 'Analyse IA',  segment: 'analysis' },
  { number: 4, label: 'Vérification', segment: 'verification' },
  { number: 5, label: 'Mémoire',     segment: 'memoire' },
  { number: 6, label: 'Export',      segment: 'export' },
]

interface Props {
  currentStep: number
  completedSteps?: Record<string, boolean>
  onStepClick?: (step: number) => void
}

/**
 * Stepper Lumen 2.1 — un seul point lumineux : l'étape ACTIVE.
 * Les étapes faites sont en verre sombre (coche argentée), les futures
 * en filet fantôme. Le Compagnon veille à droite de la pipeline.
 */
export function StepProgress({ currentStep, completedSteps = {}, onStepClick }: Props) {
  const { pathname } = useLocation()
  const companionState = useCompanionStore((s) => s.state)
  const activeStep = STEPS.find(s => pathname.endsWith(`/${s.segment}`))?.number ?? currentStep

  return (
    <div className="flex items-center w-full gap-4">
      <div className="flex items-center flex-1">
        {STEPS.map((step, index) => {
          const isCompleted =
            completedSteps[String(step.number)] === true || step.number < currentStep
          const isActive    = step.number === activeStep
          const isClickable = step.number <= currentStep && !!onStepClick

          return (
            <div key={step.number} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => onStepClick && onStepClick(step.number)}
                className={cn(
                  'flex flex-col items-center gap-1.5 bg-transparent border-none p-0',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {/* Cercle — seul l'actif porte la lumière */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300"
                  style={
                    isActive
                      ? {
                          background: 'linear-gradient(180deg, #FFFFFF, #D4D5D8)',
                          color: '#121213',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 0 16px rgba(255,255,255,.35)',
                        }
                      : isCompleted
                      ? {
                          background: 'var(--surface-2)',
                          border: '1px solid var(--line-strong)',
                          color: '#E8E9EB',
                          boxShadow: 'var(--edge-light)',
                        }
                      : {
                          background: 'transparent',
                          border: '1px solid var(--line)',
                          color: '#6B6C6F',
                        }
                  }
                >
                  {isCompleted && !isActive ? <Check size={14} strokeWidth={2.5} /> : step.number}
                </div>

                {/* Label */}
                <span
                  className="text-xs whitespace-nowrap transition-colors"
                  style={
                    isActive    ? { color: '#F7F8F8', fontWeight: 600 }
                    : isCompleted ? { color: '#98999C', fontWeight: 500 }
                    : { color: '#55565A', fontWeight: 500 }
                  }
                >
                  {step.label}
                </span>
              </button>

              {/* Connecteur — fin, discret */}
              {index < STEPS.length - 1 && (
                <div
                  className="flex-1 h-px mx-2 mt-[-1.25rem] rounded-full transition-all duration-500"
                  style={
                    isCompleted
                      ? { background: 'rgba(255,255,255,.35)' }
                      : isActive
                      ? { background: 'linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,.12))' }
                      : { background: 'var(--line)' }
                  }
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Le Compagnon veille sur la pipeline */}
      <div
        className="hidden sm:flex items-center pl-4 shrink-0 self-stretch"
        style={{ borderLeft: '1px solid var(--line)' }}
      >
        <CompanionOrb state={companionState} size={44} zoom={1.1} title="Compagnon Synorix" />
      </div>
    </div>
  )
}

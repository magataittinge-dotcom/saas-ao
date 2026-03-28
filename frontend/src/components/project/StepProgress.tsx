import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const STEPS = [
  { number: 1, label: 'Upload DCE',  segment: 'upload' },
  { number: 2, label: 'Lots',        segment: 'lots' },
  { number: 3, label: 'Analyse IA',  segment: 'analysis' },
  { number: 4, label: 'Candidature', segment: 'candidature' },
  { number: 5, label: 'Mémoire',     segment: 'memoire' },
  { number: 6, label: 'Export',      segment: 'export' },
]

interface Props {
  currentStep: number
  completedSteps?: Record<string, boolean>
  onStepClick?: (step: number) => void
}

export function StepProgress({ currentStep, completedSteps = {}, onStepClick }: Props) {
  const { pathname } = useLocation()
  const activeStep = STEPS.find(s => pathname.endsWith(`/${s.segment}`))?.number ?? currentStep

  return (
    <div className="flex items-center w-full">
      {STEPS.map((step, index) => {
        // A step shows ✓ if explicitly completed OR if it's before current unlocked step
        const isCompleted =
          completedSteps[String(step.number)] === true || step.number < currentStep
        const isActive    = step.number === activeStep
        // All unlocked steps (up to current_step inclusive) are clickable
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
              {/* Circle */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300"
                style={
                  isCompleted && !isActive
                    ? { background: '#10B981', borderColor: '#10B981', color: '#fff', boxShadow: '0 0 12px rgba(16,185,129,0.4)' }
                    : isActive && isCompleted
                    // Active step that's already been completed: show cyan with check
                    ? { background: 'linear-gradient(135deg, #0EA5E9, #3B82F6)', borderColor: '#0EA5E9', color: '#fff', boxShadow: '0 0 16px rgba(14,165,233,0.50)' }
                    : isActive
                    ? { background: 'linear-gradient(135deg, #0EA5E9, #3B82F6)', borderColor: '#0EA5E9', color: '#fff', boxShadow: '0 0 16px rgba(14,165,233,0.50)' }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#475569' }
                }
              >
                {isCompleted ? <Check size={15} strokeWidth={2.5} /> : step.number}
              </div>

              {/* Label */}
              <span
                className="text-xs whitespace-nowrap font-medium transition-colors"
                style={
                  isActive    ? { color: '#38BDF8' }
                  : isCompleted ? { color: '#34D399' }
                  : { color: '#475569' }
                }
              >
                {step.label}
              </span>
            </button>

            {/* Connector */}
            {index < STEPS.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-2 mt-[-1.25rem] rounded-full transition-all duration-500"
                style={
                  isCompleted
                    ? { background: 'linear-gradient(90deg, #10B981, #0EA5E9)' }
                    : { background: 'rgba(255,255,255,0.08)' }
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

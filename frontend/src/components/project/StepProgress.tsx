import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

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
                    ? { background: '#22D3EE', borderColor: '#22D3EE', color: '#fff' }
                    : isActive && isCompleted
                    ? { background: '#22D3EE', borderColor: '#22D3EE', color: '#fff' }
                    : isActive
                    ? { background: '#22D3EE', borderColor: '#22D3EE', color: '#fff' }
                    : { background: '#232730', borderColor: '#4B5563', color: '#9AA3AE' }
                }
              >
                {isCompleted ? <Check size={15} strokeWidth={2.5} /> : step.number}
              </div>

              {/* Label */}
              <span
                className="text-xs whitespace-nowrap font-medium transition-colors"
                style={
                  isActive    ? { color: '#22D3EE' }
                  : isCompleted ? { color: '#67E8F9' }
                  : { color: '#6B7280' }
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
                    ? { background: 'linear-gradient(90deg, #22D3EE, #67E8F9)' }
                    : isActive
                    ? { background: 'linear-gradient(90deg, rgba(34,211,238,0.40), #E2E8F0)' }
                    : { background: '#232730' }
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

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
                    ? { background: 'linear-gradient(180deg, #FFFFFF, #C9D2E0)', borderColor: 'rgba(255,255,255,.45)', color: '#0F1218' }
                    : isActive && isCompleted
                    ? { background: 'linear-gradient(180deg, #FFFFFF, #C9D2E0)', borderColor: 'rgba(255,255,255,.45)', color: '#0F1218' }
                    : isActive
                    ? { background: 'linear-gradient(180deg, #FFFFFF, #C9D2E0)', borderColor: 'rgba(255,255,255,.45)', color: '#0F1218' }
                    : { background: '#1C222D', borderColor: 'rgba(186,205,234,.23)', color: '#C7CEDA' }
                }
              >
                {isCompleted ? <Check size={15} strokeWidth={2.5} /> : step.number}
              </div>

              {/* Label */}
              <span
                className="text-xs whitespace-nowrap font-medium transition-colors"
                style={
                  isActive    ? { color: '#E4E9F2' }
                  : isCompleted ? { color: '#C3CCDC' }
                  : { color: '#788295' }
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
                    ? { background: 'linear-gradient(90deg, #9FA9BC, #E4E9F2)' }
                    : isActive
                    ? { background: 'linear-gradient(90deg, rgba(228,233,242,0.40), rgba(186,205,234,.13))' }
                    : { background: 'rgba(186,205,234,.13)' }
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

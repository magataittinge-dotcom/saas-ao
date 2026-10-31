import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useCompanionStore } from '@/stores/companionStore'
import CompanionOrb from '@/components/ui/CompanionOrb'

const STEPS = [
  { number: 1, label: 'Dépôt du dossier', segment: 'upload' },
  { number: 2, label: 'Lots',        segment: 'lots' },
  { number: 3, label: 'Décider',  segment: 'analysis' },
  { number: 4, label: 'Pièces', segment: 'verification' },
  { number: 5, label: 'Mémoire',     segment: 'memoire' },
  { number: 6, label: 'Export',      segment: 'export' },
]

interface Props {
  currentStep: number
  completedSteps?: Record<string, boolean>
  onStepClick?: (step: number) => void
}

/**
 * Fil d'étapes d'un AO : un seul point d'accent, l'étape ACTIVE. Les étapes faites portent une coche
 * d'accent sur fond doux, les futures un filet. Tout passe par les jetons clair / nuit. Sous 640 px
 * seuls les ronds (44 px) et le nom de l'étape active sont montrés : la ligne ne déborde jamais.
 * Le Compagnon veille à droite de la pipeline.
 */
export function StepProgress({ currentStep, completedSteps = {}, onStepClick }: Props) {
  const { pathname } = useLocation()
  const companionState = useCompanionStore((s) => s.state)
  const activeStep = STEPS.find(s => pathname.endsWith(`/${s.segment}`))?.number ?? currentStep

  return (
    <div className="flex items-center w-full gap-4">
      <div className="flex items-start flex-1 min-w-0">
        {STEPS.map((step, index) => {
          const isCompleted =
            completedSteps[String(step.number)] === true || step.number < currentStep
          const isActive    = step.number === activeStep
          const isClickable = step.number <= currentStep && !!onStepClick

          return (
            <div key={step.number} className="flex items-start flex-1 min-w-0 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => onStepClick && onStepClick(step.number)}
                aria-label={step.label}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1.5 bg-transparent border-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-lg',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {/* Rond : seul l'actif porte l'accent plein */}
                <div
                  className="w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300"
                  style={
                    isActive
                      ? { background: 'var(--accent-fill-solid)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-btn)' }
                      : isCompleted
                      ? { background: 'var(--accent-tint)', border: '1px solid var(--accent-ring)', color: 'var(--accent-text)' }
                      : { background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-3)' }
                  }
                >
                  {isCompleted && !isActive ? <Check size={14} strokeWidth={2.5} /> : step.number}
                </div>

                {/* Nom de l'étape : toutes sur ordinateur, seule l'active au téléphone */}
                <span
                  className={cn('text-xs whitespace-nowrap transition-colors', isActive ? 'block' : 'hidden sm:block')}
                  style={
                    isActive    ? { color: 'var(--text-1)', fontWeight: 600 }
                    : isCompleted ? { color: 'var(--text-2)', fontWeight: 500 }
                    : { color: 'var(--text-3)', fontWeight: 500 }
                  }
                >
                  {step.label}
                </span>
              </button>

              {/* Connecteur — fin, aligné sur le centre des ronds */}
              {index < STEPS.length - 1 && (
                <div
                  className="flex-1 min-w-1 h-px mx-2 mt-4 max-sm:mt-[22px] rounded-full transition-all duration-500"
                  style={
                    isCompleted
                      ? { background: 'var(--accent-ui)' }
                      : isActive
                      ? { background: 'linear-gradient(90deg, var(--accent-ui), var(--border-1))' }
                      : { background: 'var(--border-2)' }
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
        style={{ borderLeft: '1px solid var(--border-1)' }}
      >
        <CompanionOrb state={companionState} size={44} zoom={1.1} title="Compagnon Synorix" />
      </div>
    </div>
  )
}

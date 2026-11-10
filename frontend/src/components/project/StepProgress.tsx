import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useCompanionStore } from '@/stores/companionStore'
import CompanionOrb from '@/components/ui/CompanionOrb'
import type { LotUnique } from '@/lib/lotUnique'

// Numérotation d'AFFICHAGE (1-7). `serveur` : le numéro d'étape tenu par le serveur (current_step, completed_steps), qui ne
// change pas : « Plan » et « Rédiger » se rangent derrière l'étape 5 du serveur, « Export » derrière la 6.
export const STEPS = [
  { number: 1, label: 'Dépôt du dossier', segment: 'upload', serveur: 1 },
  { number: 2, label: 'Lots',        segment: 'lots', serveur: 2 },
  { number: 3, label: 'Décider',  segment: 'analysis', serveur: 3 },
  { number: 4, label: 'Pièces', segment: 'verification', serveur: 4 },
  { number: 5, label: 'Plan',        segment: 'plan', serveur: 5 },
  { number: 6, label: 'Rédiger',     segment: 'memoire', serveur: 5 },
  { number: 7, label: 'Export',      segment: 'export', serveur: 6 },
] as const

/** Le segment d'URL d'une étape d'affichage. */
export const segmentDeEtape = (numero: number): string => STEPS.find((s) => s.number === numero)?.segment ?? 'upload'

interface Props {
  currentStep: number
  completedSteps?: Record<string, boolean>
  onStepClick?: (step: number) => void
  /** Le dossier n'a qu'un lot (ou un marché unique) : l'étape « Lots » est faite d'office et dit « 1 lot ». */
  lotUnique?: LotUnique | null
}

/**
 * Fil d'étapes d'un AO : un seul point d'accent, l'étape ACTIVE. Les étapes faites portent une coche
 * d'accent sur fond doux, les futures un filet. Tout passe par les jetons clair / nuit. Sous 640 px
 * seuls les ronds (44 px) et le nom de l'étape active sont montrés : la ligne ne déborde jamais.
 * Le Compagnon veille à droite de la pipeline.
 */
export function StepProgress({ currentStep, completedSteps = {}, onStepClick, lotUnique = null }: Props) {
  const { pathname } = useLocation()
  const companionState = useCompanionStore((s) => s.state)
  // Sans segment reconnu dans l'URL : l'étape la plus avancée du serveur (« Plan » quand le serveur est à l'étape 5).
  const activeStep = STEPS.find(s => pathname.endsWith(`/${s.segment}`))?.number
    ?? STEPS.find((s) => s.serveur === currentStep)?.number ?? currentStep

  return (
    <div className="flex items-center w-full gap-4">
      <div className="flex items-start flex-1 min-w-0">
        {STEPS.map((step, index) => {
          const lotFait = !!lotUnique && step.segment === 'lots'
          const isCompleted =
            completedSteps[String(step.serveur)] === true || step.serveur < currentStep || lotFait
          const precision = lotFait ? '1 lot' : null
          const isActive    = step.number === activeStep
          const isClickable = step.serveur <= currentStep && !!onStepClick

          return (
            <div key={step.number} className="flex items-start flex-1 min-w-0 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => onStepClick && onStepClick(step.number)}
                aria-label={precision ? `${step.label}, ${precision}` : step.label}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1.5 bg-transparent border-none p-0 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-lg',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {/* Rond : seul l'actif porte l'accent plein */}
                <div
                  className="w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-pop"
                  style={
                    isActive
                      ? { background: 'var(--accent-fill-solid)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-btn)' }
                      : isCompleted
                      ? { background: 'var(--vert-soft)', border: '1px solid var(--vert-mark)', color: 'var(--vert-ink)' }
                      : { background: 'transparent', border: '1px solid var(--gris-mark)', color: 'var(--gris-ink)' }
                  }
                >
                  {isCompleted && !isActive ? <Check size={14} strokeWidth={2.5} /> : step.number}
                </div>

                {/* Nom de l'étape : toutes sur ordinateur, seule l'active au téléphone */}
                <span
                  className={cn('text-xs whitespace-nowrap transition-colors', isActive ? 'block' : 'hidden sm:block')}
                  style={
                    isActive    ? { color: 'var(--text-1)', fontWeight: 600 }
                    : isCompleted ? { color: 'var(--vert-ink)', fontWeight: 500 }
                    : { color: 'var(--gris-ink)', fontWeight: 500 }
                  }
                >
                  {step.label}
                </span>
                {precision && (
                  <span className={cn('-mt-1 text-xs whitespace-nowrap', isActive ? 'block' : 'hidden sm:block')} style={{ color: 'var(--text-2)' }}>
                    {precision}
                  </span>
                )}
              </button>

              {/* Connecteur — fin, aligné sur le centre des ronds */}
              {index < STEPS.length - 1 && (
                <div
                  className="flex-1 min-w-1 h-px mx-2 mt-4 max-sm:mt-[22px] max-sm:mx-0 max-sm:min-w-0 rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-pop"
                  style={
                    isCompleted
                      ? { background: 'var(--vert-mark)' }
                      : isActive
                      ? { background: 'linear-gradient(90deg, var(--bleu-mark), var(--gris-mark))' }
                      : { background: 'var(--gris-mark)' }
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

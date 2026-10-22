import { cn } from '@/lib/utils'
import { ETAPES_AO, avancementAO } from '@/lib/echeance'

/** Étapes réelles du pipeline AO (source commune : lib/echeance.ts). */
export const PIPELINE_STEPS = ETAPES_AO

interface PipelineRailProps {
  /** Étape courante 1→6 (Project.current_step). */
  currentStep: number
  /** Affiche le libellé de l'étape courante sous le rail. */
  showLabel?: boolean
  className?: string
}

/**
 * Rail de progression du pipeline AO — 6 segments (langage steps-track Lumen).
 * Étapes franchies remplies en lumière argentée, étape courante mise en valeur
 * (glow blanc), suivantes en neutre. Animation douce de remplissage.
 */
export function PipelineRail({ currentStep, showLabel = true, className }: PipelineRailProps) {
  const { etape: step, total } = avancementAO(currentStep)

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center gap-1" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={PIPELINE_STEPS.length} aria-label={`Étape ${step} sur ${PIPELINE_STEPS.length} : ${PIPELINE_STEPS[step - 1]}`}>
        {PIPELINE_STEPS.map((_, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <span
              key={n}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all duration-700 ease-smooth',
                done && 'bg-gradient-cyan',
                active && 'bg-gradient-cyan shadow-glow-sm',
                !done && !active && 'bg-ds-bg-3',
              )}
              style={{ transitionDelay: `${i * 50}ms` }}
            />
          )
        })}
      </div>
      {showLabel && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-ds-text-2">{PIPELINE_STEPS[step - 1]}</span>
          <span className="edge-data text-[11px] font-semibold tabular-nums text-ds-cyan">Étape {step} sur {total}</span>
        </div>
      )}
    </div>
  )
}

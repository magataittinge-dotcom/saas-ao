import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
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
  /** Pièces restant à joindre (même source que l'étape Export, lib/etatAO.ts) : l'étape « Pièces » n'est pas dite faite
   *  tant qu'il en reste, elle le dit (« 14 à joindre »). */
  piecesAJoindre?: number | null
}

const ROND = 'grid size-8 place-items-center rounded-pilule border text-sm font-semibold transition-colors duration-fast ease-survol'

/**
 * Le fil des étapes d'un AO, le même sur les sept écrans. Trois états, chacun avec sa forme et son mot (jamais la couleur
 * seule) : faite = coche sur fond vert doux ; active = anneau d'accent sur papier, nom en gras (une sélection n'est jamais un
 * aplat) ; à venir = anneau gris. Chaque étape est un bouton (cible de 44 px), désactivé tant qu'elle n'est pas atteinte.
 * Sous 640 px, seuls les ronds et le nom de l'étape active sont montrés : la ligne ne déborde jamais.
 * Aucun visage ici : il ne vit qu'à côté d'une phrase de Synorix.
 */
export function StepProgress({ currentStep, completedSteps = {}, onStepClick, lotUnique = null, piecesAJoindre = null }: Props) {
  const { pathname } = useLocation()
  // Sans segment reconnu dans l'URL : l'étape la plus avancée du serveur (« Plan » quand le serveur est à l'étape 5).
  const activeStep = STEPS.find((s) => pathname.endsWith(`/${s.segment}`))?.number
    ?? STEPS.find((s) => s.serveur === currentStep)?.number ?? currentStep

  return (
    <nav aria-label="Étapes de l’appel d’offres" data-fil-etapes="" className="pb-6">
      <ol className="flex w-full items-start">
        {STEPS.map((step, index) => {
          const lotFait = !!lotUnique && step.segment === 'lots'
          const reste = step.segment === 'verification' && piecesAJoindre ? piecesAJoindre : 0
          const atteinte = completedSteps[String(step.serveur)] === true || step.serveur < currentStep || lotFait
          const isCompleted = atteinte && reste === 0
          const precision = lotFait ? '1 lot' : reste > 0 && atteinte ? `${reste} à joindre` : null
          const isActive = step.number === activeStep
          const isClickable = step.serveur <= currentStep && !!onStepClick
          const etat = isActive ? 'active' : isCompleted ? 'faite' : reste > 0 && atteinte ? 'reste' : 'a-venir'
          const contenu = (
            <>
              <span data-etat={etat} className={cn(ROND,
                etat === 'active' ? 'border-2 border-accent-ui bg-surface-0 text-fg'
                  : etat === 'faite' ? 'border-vert-mark bg-vert-soft text-vert-ink'
                    : etat === 'reste' ? 'border-ambre-mark bg-ambre-soft text-ambre-ink'
                      : 'border-gris-mark bg-transparent text-gris-ink')}>
                {etat === 'faite' ? <Check aria-hidden size={14} strokeWidth={2.5} /> : <span className="chiffres">{step.number}</span>}
              </span>
              <span className={cn('whitespace-nowrap text-xs', isActive ? 'block font-semibold text-fg' : 'hidden font-medium text-fg-2 sm:block')}>{step.label}</span>
              {precision && <span className={cn('-mt-1 whitespace-nowrap text-xs text-fg-2', isActive ? 'block' : 'hidden sm:block')}>{precision}</span>}
            </>
          )
          return (
            <li key={step.number} className="flex min-w-0 flex-1 items-start last:flex-none">
              <button type="button" disabled={!isClickable} onClick={() => onStepClick?.(step.number)}
                aria-label={precision ? `${step.label}, ${precision}` : step.label} aria-current={isActive ? 'step' : undefined}
                className={cn('flex min-h-11 min-w-11 shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 pt-1.5 transition-colors duration-fast ease-survol',
                  isClickable ? 'cursor-pointer hover:bg-surface-1 active:scale-[.98]' : 'cursor-default')}>
                {contenu}
              </button>
              {index < STEPS.length - 1 && (
                <span aria-hidden className={cn('mx-1 mt-[22px] h-px min-w-1 flex-1', isCompleted ? 'bg-vert-mark' : 'bg-bord-2')} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

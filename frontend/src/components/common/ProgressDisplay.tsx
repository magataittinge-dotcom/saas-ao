/* L'écran d'attente : la lecture du dossier, la détection des lots, la rédaction du mémoire.
 *
 * Plusieurs minutes devant les yeux du client. Rien ne boucle : une vraie barre qui avance avec les étapes que le serveur
 * annonce, la phrase de ce que Synorix est en train de faire, le temps habituel dit simplement, et le droit de fermer la page
 * quand le traitement est détaché côté serveur (`avis`, `onArrierePlan`). C'est un des rares endroits où le visage a sa place :
 * Synorix travaille et le dit (`SynorixParle`, variantes « modal » et « page »).
 *
 * Les données viennent du parent (en général `useProgressStream`) :
 *   - variant       : « modal » (Dialogue du système), « page » (dans l'écran, avec les étapes), « inline » (bloc court)
 *   - steps         : les étapes, dans l'ordre du serveur ; `estimated_s` donne le temps habituel
 *   - currentStep   : la clé de l'étape en cours
 *   - progress      : 0-100 ; la barre ne recule jamais pendant un même traitement
 *   - detail        : ce que Synorix fait en ce moment, en une phrase
 *   - phase         : pending / in_progress / complete / error
 *   - title         : la phrase de Synorix (« Synorix lit votre dossier »)
 *   - avis          : la phrase rassurante (« Vous pouvez fermer cette page : … »), seulement si c'est vrai
 *   - onArrierePlan : « Continuer en arrière-plan » (traitement détaché) ; onCancel : « Annuler »
 *   - erreur, uniteRendue, onRelancer : l'état d'erreur dit ce qui s'est passé, que l'unité est rendue, et propose de relancer
 */
import { useEffect, useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { cn } from '@/lib/utils'

export interface StepDescriptor {
  key: string
  label: string
  estimated_s?: number
  icon?: LucideIcon
}

type Phase = 'pending' | 'in_progress' | 'complete' | 'error'
type Variant = 'modal' | 'page' | 'inline'

interface Props {
  steps: StepDescriptor[]
  currentStep: string | null
  progress: number
  detail?: string
  phase?: Phase
  variant?: Variant
  title?: string
  onCancel?: () => void
  /** Le traitement continue côté serveur : l'utilisateur peut quitter l'attente. */
  onArrierePlan?: () => void
  avis?: string
  /** Ce qui s'est passé, en une phrase (jamais le message brut du serveur). */
  erreur?: string
  /** Vrai quand le serveur rend l'unité décomptée (échec technique : `services/quota.py`, `refund`). */
  uniteRendue?: boolean
  onRelancer?: () => void
}

/**
 * Le temps habituel, dit simplement : « moins d'une minute » ou « quelques minutes ». Les durées d'étape (`estimated_s`) sont
 * des ordres de grandeur du code, pas des mesures : on n'en tire aucun chiffre précis. Null si rien n'est estimé.
 */
export function tempsHabituel(steps: readonly StepDescriptor[]): string | null {
  const secondes = steps.reduce((n, s) => n + (s.estimated_s ?? 0), 0)
  if (secondes <= 0) return null
  return secondes < 50 ? 'moins d’une minute' : 'quelques minutes'
}

/** La barre ne recule jamais pendant un même traitement (gigue du serveur, reconnexion du flux, signal tardif). */
export function avancementSuivant(precedent: number, progress: number, phase: Phase): number {
  const borne = Math.max(0, Math.min(Math.round(progress), 99))
  if (phase === 'complete') return 100
  if (phase === 'pending') return borne
  // Un nouveau traitement démarre après un traitement terminé : on repart de sa valeur.
  if (precedent >= 100 && borne < 95) return borne
  return Math.max(precedent, borne)
}

type EtatEtape = 'faite' | 'en-cours' | 'a-venir'

function etatEtape(step: StepDescriptor, currentStep: string | null, steps: StepDescriptor[], phase: Phase): EtatEtape {
  if (phase === 'complete') return 'faite'
  if (step.key === currentStep) return 'en-cours'
  const i = steps.findIndex((s) => s.key === step.key)
  const courant = currentStep ? steps.findIndex((s) => s.key === currentStep) : -1
  return courant !== -1 && i < courant ? 'faite' : 'a-venir'
}

export default function ProgressDisplay({
  steps, currentStep, progress, detail = '', phase = 'in_progress', variant = 'inline', title,
  onCancel, onArrierePlan, avis, erreur, uniteRendue, onRelancer,
}: Props) {
  const [avancement, setAvancement] = useState(() => avancementSuivant(0, progress, phase))
  useEffect(() => { setAvancement((p) => avancementSuivant(p, progress, phase)) }, [progress, phase])

  const enErreur = phase === 'error'
  const termine = phase === 'complete'
  const riche = variant !== 'inline'
  const etapeEnCours = steps.find((s) => s.key === currentStep)
  const phrase = termine ? 'Terminé' : detail || etapeEnCours?.label || 'Préparation…'
  const habituel = tempsHabituel(steps)

  const barre = (
    <div className="flex items-center gap-3">
      <div role="progressbar" aria-label={title ?? phrase} aria-valuemin={0} aria-valuemax={100} aria-valuenow={avancement}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-pilule bg-surface-2">
        <div data-avancement="" style={{ width: `${avancement}%` }}
          className={cn('h-full rounded-pilule transition-[width] duration-pop ease-survol motion-reduce:transition-none', termine ? 'bg-vert-mark' : enErreur ? 'bg-rouge-mark' : 'bg-accent-ui')} />
      </div>
      <span className="chiffres w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{avancement} %</span>
    </div>
  )

  const corps = (
    <div data-attente={phase} className="grid gap-5">
      {variant === 'page' && title && <p className="text-lg font-semibold text-fg">{title}</p>}

      {enErreur ? (
        <Message ton="erreur" titre={erreur ?? 'Le traitement s’est arrêté avant la fin.'}
          action={onRelancer && <Bouton variante="secondaire" onClick={onRelancer}>Relancer</Bouton>}>
          {uniteRendue ? 'Votre unité vous est rendue. Vos documents sont conservés.' : 'Vos documents sont conservés.'}
        </Message>
      ) : riche ? (
        <div className="grid gap-4">
          {/* Synorix travaille et le dit : le visage, collé à la phrase de ce qu'il fait en ce moment. */}
          <div aria-live="polite"><SynorixParle className="items-center">{phrase}</SynorixParle></div>
          {barre}
        </div>
      ) : (
        <div className="grid gap-2">
          <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-fg">
            {termine && <Check aria-hidden size={18} strokeWidth={2} className="shrink-0 text-vert-ink" />}
            <span className="min-w-0 break-words">{phrase}</span>
          </p>
          {barre}
        </div>
      )}

      {riche && steps.length > 1 && (
        <ol aria-label="Étapes" className="grid gap-1 border-t border-bord pt-4">
          {steps.map((step) => {
            const etat = etatEtape(step, currentStep, steps, phase)
            const arretee = enErreur && etat === 'en-cours'
            return (
              <li key={step.key} aria-current={etat === 'en-cours' ? 'step' : undefined} className="flex min-h-8 items-center gap-3 text-sm">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center">
                  {arretee ? <AlertCircle size={16} strokeWidth={1.75} className="text-rouge-ink" />
                    : etat === 'faite' ? <Check size={16} strokeWidth={2} className="text-vert-ink" />
                    : <span className={cn('rounded-pilule', etat === 'en-cours' ? 'size-2.5 bg-accent-ui' : 'size-2 bg-bord-champ')} />}
                </span>
                <span className={cn('min-w-0 flex-1', etat === 'en-cours' ? 'font-semibold text-fg' : etat === 'faite' ? 'text-fg-2' : 'text-fg-3')}>{step.label}</span>
                <span className="shrink-0 text-xs text-fg-3">{arretee ? 'Arrêtée' : etat === 'faite' ? 'Fait' : etat === 'en-cours' ? 'En cours' : ''}</span>
              </li>
            )
          })}
        </ol>
      )}

      {riche && !enErreur && !termine && (habituel || avis) && (
        <p className="text-sm text-fg-2">
          {habituel && <>Temps habituel&nbsp;: {habituel}. </>}
          {avis}
        </p>
      )}
      {!riche && avis && !enErreur && !termine && <p className="text-sm text-fg-2">{avis}</p>}

      {variant !== 'modal' && !enErreur && !termine && (onArrierePlan || onCancel) && (
        <div className="flex flex-wrap gap-2">
          {onArrierePlan && <Bouton variante="secondaire" onClick={onArrierePlan}>Continuer en arrière-plan</Bouton>}
          {onCancel && <Bouton variante="discret" onClick={onCancel}>Annuler</Bouton>}
        </div>
      )}
    </div>
  )

  if (variant !== 'modal') return corps

  // Le dialogue ne se ferme que par ses boutons : Échap ou un clic sur le voile ne coupent pas une lecture en cours.
  return (
    <Dialogue ouvert onOuvert={(o) => { if (!o && enErreur && onCancel) onCancel() }} sansFermer
      titre={title ?? 'Synorix travaille sur votre dossier'}
      actions={!enErreur && !termine && (onArrierePlan || onCancel) ? (
        <>
          {onCancel && <Bouton variante="discret" onClick={onCancel}>Annuler</Bouton>}
          {onArrierePlan && <Bouton variante="secondaire" onClick={onArrierePlan}>Continuer en arrière-plan</Bouton>}
        </>
      ) : undefined}>
      {corps}
    </Dialogue>
  )
}

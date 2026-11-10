import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * LE squelette du système (VEILLE-DESIGN P21) : un bloc FIXE, aux dimensions du contenu qu'il annonce, à la couleur de la
 * glace du thème (`--surface-1` : jamais un bloc noir sur une page claire). Il ne pulse pas et ne balaie pas : rien ne boucle
 * hors l'aurore et le visage. Décoratif (`aria-hidden`) : c'est le conteneur qui porte `aria-busy`.
 */
export function Squelette({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" data-squelette="" className={cn('rounded-md bg-surface-1', className)} {...props} />
}

/** Des lignes de texte en attente : la dernière plus courte. */
export function SqueletteLignes({ lignes = 3, className }: { lignes?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('grid gap-2.5', className)}>
      {Array.from({ length: lignes }, (_, i) => <Squelette key={i} className={cn('h-3.5', i === lignes - 1 ? 'w-3/5' : 'w-full')} />)}
    </div>
  )
}

export const DELAI_SQUELETTE_MS = 200
export const DUREE_MIN_SQUELETTE_MS = 400

export type PhaseAttente = 'rien' | 'squelette' | 'contenu'

/**
 * Le calcul de l'attente, sans horloge (testable) : rien pendant 200 ms ; passé ce délai, le squelette ; une fois montré, il
 * reste 400 ms au moins (pas d'éclair). `debut` : quand l'attente a commencé ; `montreDepuis` : quand le squelette est apparu.
 */
export function phaseAttente(enCours: boolean, maintenant: number, debut: number, montreDepuis: number | null): PhaseAttente {
  if (montreDepuis !== null) return enCours || maintenant - montreDepuis < DUREE_MIN_SQUELETTE_MS ? 'squelette' : 'contenu'
  if (!enCours) return 'contenu'
  return maintenant - debut >= DELAI_SQUELETTE_MS ? 'squelette' : 'rien'
}

/** L'attente d'un chargement : « rien » (200 ms), puis « squelette » (400 ms au moins), puis « contenu ». */
export function useAttente(enCours: boolean): PhaseAttente {
  const debut = React.useRef(Date.now())
  const montreDepuis = React.useRef<number | null>(null)
  const [phase, setPhase] = React.useState<PhaseAttente>(enCours ? 'rien' : 'contenu')
  React.useEffect(() => {
    if (enCours && montreDepuis.current === null) debut.current = Date.now()
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const avancer = () => {
      const p = phaseAttente(enCours, Date.now(), debut.current, montreDepuis.current)
      if (p === 'squelette' && montreDepuis.current === null) montreDepuis.current = Date.now()
      if (p === 'contenu') montreDepuis.current = null
      setPhase(p)
      if (p === 'rien') minuterie = setTimeout(avancer, DELAI_SQUELETTE_MS - (Date.now() - debut.current) + 1)
      else if (p === 'squelette' && !enCours) minuterie = setTimeout(avancer, DUREE_MIN_SQUELETTE_MS - (Date.now() - (montreDepuis.current ?? Date.now())) + 1)
    }
    avancer()
    return () => { if (minuterie) clearTimeout(minuterie) }
  }, [enCours])
  return phase
}

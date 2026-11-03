import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { etatEcheance, type EcheanceSource } from '@/lib/echeance'

interface DeadlinePillProps {
  /** Échéance de l'AO (echeanceAO(projet)). */
  echeance?: EcheanceSource | null
  /** Met en avant l'échéance la plus proche (anneau d'accent). */
  emphasized?: boolean
  className?: string
}

/**
 * Chip d'échéance (COULEURS.md) : rouge à 3 jours ou moins, aujourd'hui et date dépassée, ambre de 4 à 7 jours,
 * neutre au-delà. Le libellé (« J−3 », « Date de remise passée ») et l'icône restent écrits : jamais la couleur seule.
 * Le libellé vient de etatEcheance (1.14), le même sur tous les écrans.
 */
export function DeadlinePill({ echeance, emphasized, className }: DeadlinePillProps) {
  const e = etatEcheance(echeance)
  if (e.etat === 'sans_date') {
    return <span className={cn('text-xs text-fg-3', className)}>—</span>
  }
  const soon = e.etat === 'proche' || e.etat === 'aujourdhui'
  const rouge = e.etat === 'passee' || e.etat === 'aujourdhui' || (e.etat === 'proche' && (e.jours ?? 99) <= 3)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pilule px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors duration-base ease-lien',
        rouge ? 'bg-rouge-soft text-rouge-ink' : soon ? 'bg-ambre-soft text-ambre-ink' : 'border border-bord-2 bg-surface-1 text-fg-2',
        emphasized && soon && 'ring-1 ring-accent-ring/30',
        className,
      )}
    >
      <CalendarClock size={11} className={soon || rouge ? undefined : 'text-fg-3'} aria-hidden />
      {e.libelle}
    </span>
  )
}

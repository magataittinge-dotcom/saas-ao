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
 * Chip d'échéance — informatif et positif, jamais alarmiste (règle Synorix).
 * Proche (≤ 7 j) ou aujourd'hui = mis en valeur (teinte d'accent) ; plus lointain =
 * fond neutre ; date passée = « Date de remise passée », en retrait.
 * Le libellé vient de etatEcheance (1.14), le même sur tous les écrans.
 */
export function DeadlinePill({ echeance, emphasized, className }: DeadlinePillProps) {
  const e = etatEcheance(echeance)
  if (e.etat === 'sans_date') {
    return <span className={cn('text-xs text-fg-3', className)}>—</span>
  }
  const soon = e.etat === 'proche' || e.etat === 'aujourdhui'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pilule px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors duration-base ease-lien',
        soon
          ? 'bg-accent-tint text-accent-text'
          : e.etat === 'passee'
            ? 'border border-bord-2 bg-surface-1 text-fg-3'
            : 'border border-bord-2 bg-surface-1 text-fg-2',
        emphasized && soon && 'ring-1 ring-accent-ring/30',
        className,
      )}
    >
      <CalendarClock size={11} className={soon ? 'text-accent-text' : 'text-fg-3'} aria-hidden />
      {e.libelle}
    </span>
  )
}

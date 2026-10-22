import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { etatEcheance, type EcheanceSource } from '@/lib/echeance'

interface DeadlinePillProps {
  /** Échéance de l'AO (echeanceAO(projet)). */
  echeance?: EcheanceSource | null
  /** Met en avant l'échéance la plus proche (glow lumineux). */
  emphasized?: boolean
  className?: string
}

/**
 * Chip d'échéance — informatif et positif, jamais alarmiste (règle Synorix).
 * Proche (≤ 7 j) ou aujourd'hui = mis en valeur en lumière ; plus lointain =
 * graphite neutre ; date passée = « Date de remise passée », en retrait.
 * Le libellé vient de etatEcheance (1.14), le même sur tous les écrans.
 */
export function DeadlinePill({ echeance, emphasized, className }: DeadlinePillProps) {
  const e = etatEcheance(echeance)
  if (e.etat === 'sans_date') {
    return <span className={cn('text-xs text-ds-text-3', className)}>—</span>
  }
  const soon = e.etat === 'proche' || e.etat === 'aujourdhui'

  return (
    <span
      className={cn(
        'edge-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-all',
        soon
          ? 'bg-ds-cyan/10 text-ds-cyan-dark'
          : e.etat === 'passee'
            ? 'bg-ds-bg-2 text-ds-text-3 border border-ds-border-subtle'
            : 'bg-ds-bg-2 text-ds-text-2 border border-ds-border-subtle',
        emphasized && soon && 'shadow-glow-sm ring-1 ring-ds-cyan/25',
        className,
      )}
    >
      <CalendarClock size={11} className={soon ? 'text-ds-cyan' : 'text-ds-text-3'} />
      {e.libelle}
    </span>
  )
}

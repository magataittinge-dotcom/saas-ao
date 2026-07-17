import { CalendarClock } from 'lucide-react'
import { daysUntil } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface DeadlinePillProps {
  deadline?: string
  /** Met en avant l'échéance la plus proche (glow lumineux). */
  emphasized?: boolean
  className?: string
}

/**
 * Chip d'échéance — informatif et positif, jamais alarmiste (règle Synorix).
 * Proche (≤ 7 j) = mis en valeur en lumière ; plus lointain = graphite neutre.
 * Aucune couleur rouge anxiogène.
 */
export function DeadlinePill({ deadline, emphasized, className }: DeadlinePillProps) {
  if (!deadline) {
    return <span className={cn('text-xs text-ds-text-3', className)}>—</span>
  }

  const days = daysUntil(deadline)
  const soon = days <= 7
  const label =
    days < 0 ? 'À déposer' : days === 0 ? "Aujourd'hui" : `J-${days}`

  return (
    <span
      className={cn(
        'edge-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all',
        soon
          ? 'bg-ds-cyan/10 text-ds-cyan-dark'
          : 'bg-ds-bg-2 text-ds-text-2 border border-ds-border-subtle',
        emphasized && soon && 'shadow-glow-sm ring-1 ring-ds-cyan/25',
        className,
      )}
    >
      <CalendarClock size={11} className={soon ? 'text-ds-cyan' : 'text-ds-text-3'} />
      {label}
    </span>
  )
}

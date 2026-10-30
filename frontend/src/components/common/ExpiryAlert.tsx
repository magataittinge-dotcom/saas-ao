import { AlertTriangle, Clock } from 'lucide-react'
import { daysUntil, formatDate } from '@/lib/utils'

interface Props {
  expiryDate: string
  documentName: string
}

export function ExpiryAlert({ expiryDate, documentName }: Props) {
  const days = daysUntil(expiryDate)
  const isExpired = days < 0
  const isUrgent = days >= 0 && days <= 7
  const isWarning = days > 7 && days <= 30

  if (!isExpired && !isUrgent && !isWarning) return null

  return (
    <div
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
      style={
        isExpired || isUrgent
          ? { background: 'color-mix(in srgb, var(--danger-fg) 10%, transparent)', color: 'var(--danger-fg)', border: '1px solid color-mix(in srgb, var(--danger-fg) 25%, transparent)' }
          : { background: 'color-mix(in srgb, var(--text-3) 8%, transparent)', color: 'var(--text-3)', border: '1px solid color-mix(in srgb, var(--text-3) 20%, transparent)' }
      }
    >
      {isExpired || isUrgent ? <AlertTriangle size={16} /> : <Clock size={16} />}
      <span>
        <span className="font-medium">{documentName}</span>{' '}
        {isExpired
          ? `à renouveler — fin de validité le ${formatDate(expiryDate)}`
          : `à renouveler d’ici ${days} jour${days > 1 ? 's' : ''} — valable jusqu’au ${formatDate(expiryDate)}`}
      </span>
    </div>
  )
}

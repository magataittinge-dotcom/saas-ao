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
          ? { background: 'rgba(239,68,68,0.10)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.25)' }
          : { background: 'rgba(245,158,11,0.10)', color: '#D97706', border: '1px solid rgba(245,158,11,0.25)' }
      }
    >
      {isExpired || isUrgent ? <AlertTriangle size={16} /> : <Clock size={16} />}
      <span>
        <span className="font-medium">{documentName}</span>{' '}
        {isExpired
          ? `expiré depuis ${Math.abs(days)} jours (${formatDate(expiryDate)})`
          : `expire dans ${days} jour${days > 1 ? 's' : ''} — ${formatDate(expiryDate)}`}
      </span>
    </div>
  )
}

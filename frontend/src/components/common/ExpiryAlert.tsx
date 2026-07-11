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
          ? { background: 'rgba(248,113,113,0.10)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }
          : { background: 'rgba(154,163,174,0.08)', color: '#9AA3AE', border: '1px solid rgba(154,163,174,0.20)' }
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

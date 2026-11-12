import { daysUntil, formatDate } from '@/lib/dates'
import { Message } from '@/components/ui/message'

interface Props {
  expiryDate: string
  documentName: string
}

/** Une pièce à renouveler : le `Message` du système, rouge si la date est passée, ambre si elle approche (30 jours). */
export function ExpiryAlert({ expiryDate, documentName }: Props) {
  const days = daysUntil(expiryDate)
  const isExpired = days < 0
  if (!isExpired && days > 30) return null
  return (
    <Message ton={isExpired ? 'erreur' : 'attention'}>
      <span className="text-fg">
        <span className="font-medium">{documentName}</span>{' '}
        {isExpired
          ? `à renouveler — fin de validité le ${formatDate(expiryDate)}`
          : `à renouveler d’ici ${days} jour${days > 1 ? 's' : ''} — valable jusqu’au ${formatDate(expiryDate)}`}
      </span>
    </Message>
  )
}

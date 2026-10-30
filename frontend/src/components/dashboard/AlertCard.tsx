import { AlertTriangle, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Alert {
  id: string
  type: 'document_expired' | 'document_expiring' | 'deadline_urgent'
  message: string
  severity: 'red' | 'orange'
}

interface Props {
  alerts: Alert[]
}

// Alertes : « à traiter » = ton warning, « à surveiller » = neutre. Aucune couleur écrite ici (jetons).
export function AlertCard({ alerts }: Props) {
  if (alerts.length === 0) return null

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
        <AlertTriangle size={18} className="text-fg-3" aria-hidden />
        Alertes
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
              alert.severity === 'red'
                ? 'border-warning-border bg-warning-bg text-warning'
                : 'border-bord-2 bg-surface-0 text-fg-2',
            )}
          >
            {alert.severity === 'red' ? <AlertTriangle size={14} aria-hidden /> : <Clock size={14} aria-hidden />}
            {alert.message}
          </div>
        ))}
      </div>
    </Card>
  )
}

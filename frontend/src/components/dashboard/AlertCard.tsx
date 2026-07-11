import { AlertTriangle, Clock } from 'lucide-react'

interface Alert {
  id: string
  type: 'document_expired' | 'document_expiring' | 'deadline_urgent'
  message: string
  severity: 'red' | 'orange'
}

interface Props {
  alerts: Alert[]
}

export function AlertCard({ alerts }: Props) {
  if (alerts.length === 0) return null

  return (
    <div
      className="glass-card p-4"
      style={{ borderColor: 'rgba(154,163,174,0.20)' }}
    >
      <h2 className="font-semibold text-ds-text mb-3 flex items-center gap-2">
        <AlertTriangle size={18} style={{ color: '#9AA3AE' }} />
        Alertes
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-2 text-sm py-1.5 px-3 rounded-md"
            style={
              alert.severity === 'red'
                ? { background: 'rgba(248,113,113,0.10)', color: '#F87171', border: '1px solid rgba(248,113,113,0.20)' }
                : { background: 'rgba(154,163,174,0.08)', color: '#9AA3AE', border: '1px solid rgba(154,163,174,0.20)' }
            }
          >
            {alert.severity === 'red' ? <AlertTriangle size={14} /> : <Clock size={14} />}
            {alert.message}
          </div>
        ))}
      </div>
    </div>
  )
}

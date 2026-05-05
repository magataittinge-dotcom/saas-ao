import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'rgba(14,165,233,0.10)', color: '#0284C7',  border: '1px solid rgba(14,165,233,0.20)' },
  warning: { background: 'rgba(100,116,139,0.08)', color: '#475569',  border: '1px solid rgba(100,116,139,0.20)' },
  danger:  { background: 'rgba(239,68,68,0.10)',  color: '#DC2626',  border: '1px solid rgba(239,68,68,0.20)'  },
  info:    { background: 'rgba(14,165,233,0.10)', color: '#0284C7',  border: '1px solid rgba(14,165,233,0.20)' },
  neutral: { background: '#F8FAFC', color: '#475569',  border: '1px solid #E2E8F0'},
}

interface Props {
  label: string
  variant: BadgeVariant
  className?: string
}

export function StatusBadge({ label, variant, className }: Props) {
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}
      style={variantStyles[variant]}
    >
      {label}
    </span>
  )
}

export function complianceStatusBadge(status: ComplianceStatus) {
  const map: Record<ComplianceStatus, { label: string; variant: BadgeVariant }> = {
    couvert:     { label: '✅ Couvert',    variant: 'success' },
    non_couvert: { label: '❌ Manquant',   variant: 'danger'  },
    partiel:     { label: '⚠️ Partiel',   variant: 'warning' },
    a_generer:   { label: '🔄 À générer', variant: 'info'    },
    expire:      { label: '⏰ Expiré',    variant: 'danger'  },
  }
  return map[status]
}

export function documentStatusBadge(status: DocumentStatus) {
  const map: Record<DocumentStatus, { label: string; variant: BadgeVariant }> = {
    valid:          { label: '🟢 Valide',        variant: 'success' },
    expiring_soon:  { label: '🟠 Expire bientôt',variant: 'warning' },
    expired:        { label: '🔴 Expiré',        variant: 'danger'  },
  }
  return map[status]
}

export function projectStatusBadge(status: ProjectStatus) {
  const map: Record<ProjectStatus, { label: string; variant: BadgeVariant }> = {
    brouillon: { label: 'Brouillon', variant: 'neutral'  },
    en_cours:  { label: 'En cours',  variant: 'info'     },
    analyzed:  { label: 'Analysé',   variant: 'info'     },
    soumis:    { label: 'Soumis',    variant: 'warning'  },
    gagné:     { label: 'Gagné',     variant: 'success'  },
    perdu:     { label: 'Perdu',     variant: 'danger'   },
  }
  return map[status]
}

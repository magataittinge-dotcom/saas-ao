import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'rgba(16,185,129,0.12)', color: '#34D399',  border: '1px solid rgba(16,185,129,0.25)' },
  warning: { background: 'rgba(245,158,11,0.12)', color: '#FCD34D',  border: '1px solid rgba(245,158,11,0.25)' },
  danger:  { background: 'rgba(239,68,68,0.12)',  color: '#F87171',  border: '1px solid rgba(239,68,68,0.25)'  },
  info:    { background: 'rgba(59,130,246,0.12)', color: '#93C5FD',  border: '1px solid rgba(59,130,246,0.25)' },
  neutral: { background: 'rgba(255,255,255,0.06)',color: '#64748B',  border: '1px solid rgba(255,255,255,0.10)'},
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
    soumis:    { label: 'Soumis',    variant: 'warning'  },
    gagné:     { label: 'Gagné',     variant: 'success'  },
    perdu:     { label: 'Perdu',     variant: 'danger'   },
  }
  return map[status]
}

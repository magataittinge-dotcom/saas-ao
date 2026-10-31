import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'amber'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'color-mix(in srgb, var(--success-fg) 10%, transparent)', color: 'var(--success-fg)',  border: '1px solid color-mix(in srgb, var(--success-fg) 22%, transparent)' },
  warning: { background: 'color-mix(in srgb, var(--warning-fg) 9%, transparent)', color: 'var(--warning-fg)',  border: '1px solid color-mix(in srgb, var(--warning-fg) 22%, transparent)' },
  danger:  { background: 'color-mix(in srgb, var(--danger-fg) 10%, transparent)',  color: 'var(--danger-fg)',  border: '1px solid color-mix(in srgb, var(--danger-fg) 20%, transparent)'  },
  info:    { background: 'color-mix(in srgb, var(--text-1) 10%, transparent)', color: 'var(--text-2)',  border: '1px solid var(--border-2)' },
  neutral: { background: 'var(--surface-1)', color: 'var(--text-3)',  border: '1px solid var(--border-2)'},
  amber:   { background: 'color-mix(in srgb, var(--warning-fg) 10%, transparent)', color: 'var(--warning-fg)',  border: '1px solid color-mix(in srgb, var(--warning-fg) 25%, transparent)' },
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
    // « couvert » = confirmée par l'utilisateur (décision du 25/10) : jamais posé par Synorix
    couvert:     { label: 'Confirmée par vous', variant: 'success' },
    non_couvert: { label: 'À confirmer',  variant: 'neutral' },
    partiel:     { label: '⚠️ Partiel',   variant: 'warning' },
    a_generer:   { label: '🔄 À générer', variant: 'info'    },
    expire:      { label: 'À renouveler', variant: 'amber'  },
  }
  return map[status]
}

export function documentStatusBadge(status: DocumentStatus) {
  const map: Record<DocumentStatus, { label: string; variant: BadgeVariant }> = {
    valid:          { label: 'Prêt',             variant: 'success' },
    expiring_soon:  { label: 'Prêt',             variant: 'success' },
    expired:        { label: 'À renouveler',     variant: 'amber'   },
    unverified:     { label: 'Date de validité à confirmer', variant: 'amber' },
    unclassified:   { label: 'À ranger',         variant: 'neutral' },
  }
  return map[status] ?? map.unclassified
}

export function projectStatusBadge(status: ProjectStatus) {
  const map: Record<ProjectStatus, { label: string; variant: BadgeVariant }> = {
    brouillon:  { label: 'Brouillon',            variant: 'neutral'  },
    en_cours:   { label: 'En cours',             variant: 'info'     },
    analyzed:   { label: 'Analysé',              variant: 'info'     },
    // Ton neutre : décision éclairée de ne pas répondre — pas une alerte.
    sans_suite: { label: 'Analysé — sans suite', variant: 'neutral'  },
    soumis:     { label: 'Soumis',               variant: 'warning'  },
    gagné:      { label: 'Gagné',                variant: 'success'  },
    perdu:      { label: 'Perdu',                variant: 'danger'   },
  }
  return map[status]
}

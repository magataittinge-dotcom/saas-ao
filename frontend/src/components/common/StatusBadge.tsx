import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'amber'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'rgba(34,211,238,0.10)', color: '#67E8F9',  border: '1px solid rgba(34,211,238,0.20)' },
  warning: { background: 'rgba(154,163,174,0.08)', color: '#9AA3AE',  border: '1px solid rgba(154,163,174,0.20)' },
  danger:  { background: 'rgba(248,113,113,0.10)',  color: '#F87171',  border: '1px solid rgba(248,113,113,0.20)'  },
  info:    { background: 'rgba(34,211,238,0.10)', color: '#67E8F9',  border: '1px solid rgba(34,211,238,0.20)' },
  neutral: { background: '#232730', color: '#9AA3AE',  border: '1px solid rgba(255,255,255,0.06)'},
  amber:   { background: 'rgba(245,158,11,0.10)', color: '#FBBF24',  border: '1px solid rgba(245,158,11,0.25)' },
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
    valid:          { label: '✓ Valide',         variant: 'success' },
    expiring_soon:  { label: '🟠 Expire bientôt',variant: 'warning' },
    expired:        { label: '✗ Expiré',         variant: 'danger'  },
    unverified:     { label: '⚠️ À vérifier',    variant: 'amber'   },
    unclassified:   { label: 'Non classé',       variant: 'neutral' },
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

import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'amber'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'rgba(110,231,168,0.10)', color: '#6EE7A8',  border: '1px solid rgba(110,231,168,0.22)' },
  warning: { background: 'rgba(245,194,107,0.09)', color: '#F5C26B',  border: '1px solid rgba(245,194,107,0.22)' },
  danger:  { background: 'rgba(245,142,134,0.10)',  color: '#F58E86',  border: '1px solid rgba(245,142,134,0.20)'  },
  info:    { background: 'rgba(228,233,242,0.10)', color: '#C3CCDC',  border: '1px solid rgba(228,233,242,0.20)' },
  neutral: { background: '#1C222D', color: '#9BA4B5',  border: '1px solid rgba(186,205,234,.13)'},
  amber:   { background: 'rgba(245,158,11,0.10)', color: '#F5C26B',  border: '1px solid rgba(245,158,11,0.25)' },
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

import { AlertCircle, Check, Clock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'amber'

// Couleurs d'état (COULEURS.md) : vert fait / prêt / gagné, ambre à surveiller, rouge urgent ou négatif, bleu en cours, gris à venir.
// Le mot est toujours écrit ; une icône l'accompagne pour les états vert, ambre et rouge (jamais la couleur seule).
const ton = (n: 'vert' | 'ambre' | 'rouge' | 'bleu' | 'gris'): React.CSSProperties => ({ background: `var(--${n}-soft)`, color: `var(--${n}-ink)` })
const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: ton('vert'),
  warning: ton('ambre'),
  danger:  ton('rouge'),
  info:    ton('bleu'),
  neutral: ton('gris'),
  amber:   ton('ambre'),
}
const ICONES: Partial<Record<BadgeVariant, LucideIcon>> = { success: Check, warning: Clock, amber: Clock, danger: AlertCircle }

interface Props {
  label: string
  variant: BadgeVariant
  className?: string
}

export function StatusBadge({ label, variant, className }: Props) {
  const Icone = ICONES[variant]
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}
      style={variantStyles[variant]}
    >
      {Icone && <Icone size={11} strokeWidth={2.4} aria-hidden />}
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
    expired:        { label: 'À renouveler',     variant: 'danger'  },
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
    soumis:     { label: 'Soumis',               variant: 'info'     },
    gagné:      { label: 'Gagné',                variant: 'success'  },
    perdu:      { label: 'Perdu',                variant: 'danger'   },
  }
  return map[status]
}

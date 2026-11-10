import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import type { ComplianceStatus, DocumentStatus, ProjectStatus } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'amber'

// ALIAS MINCE. La pastille du système est `PastilleEtat` (components/ui/pastille.tsx) : un sens, un mot, une icône.
// Les anciennes variantes renvoient aux six sens (vert fait, ambre à surveiller, rouge urgent, bleu en cours, gris à venir).
const VERS: Record<BadgeVariant, Sens> = { success: 'vert', warning: 'ambre', amber: 'ambre', danger: 'rouge', info: 'bleu', neutral: 'gris' }

interface Props {
  label: string
  variant: BadgeVariant
  className?: string
}

export function StatusBadge({ label, variant, className }: Props) {
  return <PastilleEtat sens={VERS[variant]} icone={variant === 'info' || variant === 'neutral' ? null : undefined} className={className}>{label}</PastilleEtat>
}

export function complianceStatusBadge(status: ComplianceStatus) {
  const map: Record<ComplianceStatus, { label: string; variant: BadgeVariant }> = {
    // « couvert » = confirmée par l'utilisateur (décision du 25/10) : jamais posé par Synorix
    couvert:     { label: 'Confirmée par vous', variant: 'success' },
    non_couvert: { label: 'À confirmer',  variant: 'neutral' },
    partiel:     { label: 'Partiel',   variant: 'warning' },
    a_generer:   { label: 'À générer', variant: 'info'    },
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

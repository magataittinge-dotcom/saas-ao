import { CalendarClock } from 'lucide-react'
import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import { cn } from '@/lib/utils'
import { etatEcheance, type EcheanceSource } from '@/lib/echeance'

interface DeadlinePillProps {
  /** Échéance de l'AO ou de l'avis (echeanceAO(projet), ou `{ date }`). */
  echeance?: EcheanceSource | null
  className?: string
}

/**
 * La pastille d'échéance (COULEURS.md) : rouge à 3 jours ou moins, aujourd'hui et date dépassée, ambre de 4 à 7 jours,
 * gris au-delà. C'est la pastille du système : le libellé (« J−3 », « Date de remise passée ») et l'icône restent écrits,
 * jamais la couleur seule. Le libellé vient de etatEcheance (1.14), le même sur tous les écrans.
 */
export function DeadlinePill({ echeance, className }: DeadlinePillProps) {
  const e = etatEcheance(echeance)
  if (e.etat === 'sans_date') return <span className={cn('text-xs text-fg-3', className)}>—</span>
  const proche = e.etat === 'proche' || e.etat === 'aujourdhui'
  const rouge = e.etat === 'passee' || e.etat === 'aujourdhui' || (e.etat === 'proche' && (e.jours ?? 99) <= 3)
  const sens: Sens = rouge ? 'rouge' : proche ? 'ambre' : 'gris'
  return <PastilleEtat sens={sens} icone={CalendarClock} className={className}>{e.libelle}</PastilleEtat>
}

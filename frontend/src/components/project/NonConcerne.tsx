import type { ChecklistItem } from '@/types'

// « Non concerné » (B2 §7 n°8) : une pièce conditionnelle (DC4 « le cas
// échéant », habilitation « si groupement »…) que l'entreprise écarte. Persisté
// et journalisé par le serveur (POST /checklist/{id}/non-concerne), réversible,
// et hors des comptes — comme dans le score du serveur.

export function estNonConcernee(item: Pick<ChecklistItem, 'status'>): boolean {
  return item.status === 'non_applicable'
}

/** Pièces comptées : une pièce « Non concerné » sort des comptes. */
export function piecesComptees<T extends Pick<ChecklistItem, 'status'>>(items: T[]): T[] {
  return items.filter((i) => !estNonConcernee(i))
}

export default function NonConcerneBouton({
  item, onNonConcerne,
}: {
  item: ChecklistItem
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
}) {
  if (!onNonConcerne) return null
  const nc = estNonConcernee(item)
  return (
    <button
      type="button"
      onClick={() => { void onNonConcerne(item, !nc) }}
      className="shrink-0 text-xs font-medium hover:underline"
      style={{ color: 'var(--text-3)' }}
    >
      {nc ? 'Je suis concerné' : 'Non concerné'}
    </button>
  )
}

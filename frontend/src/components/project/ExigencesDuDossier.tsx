import { GROUPES_EXIGENCES, compteGroupe, type GroupeExigences } from '@/lib/exportDossier'
import { Sigle } from '@/components/common/Sigle'

// Exigences du dossier, par groupe, avec leur source et la confirmation de
// l'utilisateur (décision du 25/10, export « 0/N »). « Confirmée » n'est
// jamais posé par Synorix : seulement par la case ou « Tout confirmer ».

export interface ExigenceExport {
  id: string
  exigence_text: string
  category: string
  priority: string
  status: string
  groupe: string
  source_document: string | null
  source_page: number | null
  source_verifiee: boolean
}

// Statut « confirmée par vous » (backend : models.compliance_item.STATUT_CONFIRMEE).
const CONFIRMEE = 'couvert'

export function estConfirmee(item: Pick<ExigenceExport, 'status'>): boolean {
  return item.status === CONFIRMEE
}

export default function ExigencesDuDossier({
  items, onConfirmer, onConfirmerGroupe, enCours,
}: {
  items: ExigenceExport[]
  onConfirmer: (item: ExigenceExport, confirmee: boolean) => void
  onConfirmerGroupe: (groupe: GroupeExigences) => void
  enCours: boolean
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>
        Les exigences apparaissent après la lecture du <Sigle code="DCE" />
      </p>
    )
  }
  return (
    <div className="space-y-3.5">
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Cochez les exigences que vous avez vérifiées, ou confirmez tout un groupe.
      </p>
      {GROUPES_EXIGENCES.map(({ id, label }) => {
        const duGroupe = items.filter((i) => i.groupe === id)
        if (duGroupe.length === 0) return null
        const confirmees = duGroupe.filter(estConfirmee).length
        return (
          <section key={id}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="min-w-0 text-xs">
                <span className="font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</span>
                <span className="ml-2" style={{ color: 'var(--text-3)' }}>{compteGroupe(duGroupe.length, confirmees)}</span>
              </p>
              {confirmees < duGroupe.length && (
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => onConfirmerGroupe(id)}
                  className="glass-btn shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50 max-md:min-h-11 max-md:px-3 max-md:text-sm"
                  style={{ color: 'var(--text-2)' }}
                >
                  Tout confirmer
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {duGroupe.map((item) => (
                <li key={item.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-ds-bg-2 transition-colors max-md:flex-wrap max-md:gap-x-1 max-md:gap-y-1 max-md:px-0">
                  {/* Au téléphone, une cible de 44 px autour de la case (le libellé n'a pas de boîte au-delà) ; au bureau, `contents`. */}
                  <label className="contents max-md:-my-2.5 max-md:-ml-2.5 max-md:grid max-md:size-11 max-md:shrink-0 max-md:cursor-pointer max-md:place-items-center">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0 max-md:mt-0 max-md:size-5 max-md:accent-[var(--accent-ui)]"
                      checked={estConfirmee(item)}
                      disabled={enCours}
                      onChange={(e) => onConfirmer(item, e.target.checked)}
                      aria-label="Confirmée par vous"
                    />
                  </label>
                  <span className="text-sm leading-relaxed flex-1 max-md:min-w-0 max-md:basis-[calc(100%-3rem)]" style={{ color: 'var(--text-2)' }}>
                    {item.exigence_text}
                  </span>
                  <span
                    className="text-xs shrink-0 whitespace-nowrap max-md:ml-[2.375rem] max-md:min-w-0 max-md:shrink max-md:whitespace-normal max-md:break-words"
                    style={{ color: item.source_verifiee ? 'var(--text-3)' : 'var(--warn)' }}
                  >
                    {item.source_verifiee
                      ? `${item.source_document ?? 'Dossier'}${item.source_page ? ` p.${item.source_page}` : ''}`
                      : 'À vérifier dans le dossier'}
                  </span>
                  {item.priority === 'obligatoire' && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}
                    >
                      Obligatoire
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

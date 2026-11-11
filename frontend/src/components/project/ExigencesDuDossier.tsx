import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { GROUPES_EXIGENCES, compteGroupe, type GroupeExigences } from '@/lib/exportDossier'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case'
import { Sigle } from '@/components/common/Sigle'

// Exigences du dossier, par groupe, avec leur source et la confirmation de
// l'utilisateur (décision du 25/10, export « 0/N »). « Confirmée » n'est
// jamais posé par Synorix : seulement par la case ou « Tout confirmer ».
// Jury, tour 1 : des rangées du système (case dessinée, filets), un groupe = une rangée qui se déplie, plus de cadre
// qui défile dans la page ; au-delà de six exigences, « Voir les N autres ».

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
/** Exigences montrées d'emblée dans un groupe déplié. */
const VISIBLES = 6

export function estConfirmee(item: Pick<ExigenceExport, 'status'>): boolean {
  return item.status === CONFIRMEE
}

function source(item: ExigenceExport): string {
  if (!item.source_verifiee) return 'À vérifier dans le dossier'
  return `${item.source_document ?? 'Dossier'}${item.source_page ? ` p.${item.source_page}` : ''}`
}

function Groupe({ label, items, ouvert, onConfirmer, onConfirmerTout, enCours }: {
  label: string
  items: ExigenceExport[]
  ouvert: boolean
  onConfirmer: (item: ExigenceExport, confirmee: boolean) => void
  onConfirmerTout: () => void
  enCours: boolean
}) {
  const [tout, setTout] = useState(false)
  const confirmees = items.filter(estConfirmee).length
  const montrees = tout ? items : items.slice(0, VISIBLES)
  return (
    <details open={ouvert || undefined} className="group border-t border-bord first:border-t-0">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 py-2 transition-colors duration-fast ease-survol hover:bg-surface-1 sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-3 transition-transform duration-fast ease-survol group-open:rotate-90" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-fg">{label}</span>
          <span className="text-fg-3"> · {compteGroupe(items.length, confirmees)}</span>
        </span>
      </summary>
      <div className="border-t border-bord px-4 pb-3 sm:px-5">
        <ul aria-label={`Exigences : ${label}`}>
          {montrees.map((item) => (
            <li key={item.id} className="border-t border-bord first:border-t-0">
              <CaseACocher
                coche={estConfirmee(item)}
                disabled={enCours}
                onChange={(coche) => onConfirmer(item, coche)}
                className="items-start py-3 [&>button]:mt-0.5"
                libelle={(
                  <>
                    <span className="block break-words leading-relaxed text-fg-2">{item.exigence_text}</span>
                    <span className={`mt-0.5 block text-xs ${item.source_verifiee ? 'text-fg-3' : 'font-medium text-ambre-ink'}`}>
                      {source(item)}{item.priority === 'obligatoire' && ' · obligatoire'}
                    </span>
                  </>
                )}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1">
          {items.length > VISIBLES && !tout
            ? <Bouton variante="lien" onClick={() => setTout(true)}>Voir les {items.length - VISIBLES} autres</Bouton>
            : <span />}
          {confirmees < items.length && (
            <Bouton variante="secondaire" disabled={enCours} onClick={onConfirmerTout}>Tout confirmer</Bouton>
          )}
        </div>
      </div>
    </details>
  )
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
    return <p className="px-4 py-3 text-sm text-fg-2 sm:px-5">Les exigences apparaissent après l’analyse du <Sigle code="DCE" />.</p>
  }
  const groupes = GROUPES_EXIGENCES.map((g) => ({ ...g, items: items.filter((i) => i.groupe === g.id) })).filter((g) => g.items.length > 0)
  return (
    <div>
      <p className="border-b border-bord px-4 py-3 text-sm text-fg-2 sm:px-5">
        Cochez les exigences que vous avez vérifiées, ou confirmez tout un groupe.
      </p>
      {groupes.map((g, i) => (
        <Groupe
          key={g.id} label={g.label} items={g.items} ouvert={i === 0}
          onConfirmer={onConfirmer} onConfirmerTout={() => onConfirmerGroupe(g.id)} enCours={enCours}
        />
      ))}
    </div>
  )
}

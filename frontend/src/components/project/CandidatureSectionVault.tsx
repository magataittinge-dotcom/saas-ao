import { useMemo } from 'react'
import { Sigle } from '@/components/common/Sigle'
import { FileText } from 'lucide-react'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'
import NonConcerneBouton, { estNonConcernee } from '@/components/project/NonConcerne'
import { noteDepot, noteValidite, statutPiece } from '@/lib/statutPiece'
import { EtatElement, SectionEtape } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { PastilleEtat } from '@/components/ui/pastille'
import { nomPiece } from '@/lib/nomsPieces'
import { etatDeStatut } from '@/lib/resumePieces'
import { libelleSource } from '@/lib/resumeAO'

type VaultCategory = 'administratif' | 'assurances' | 'financier' | 'technique'

const CATEGORY_ORDER: VaultCategory[] = ['administratif', 'assurances', 'financier', 'technique']

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  administratif: 'Pièces administratives',
  assurances:    'Assurances',
  financier:     'Capacités financières',
  technique:     'Capacités techniques',
}

function categorize(item: ChecklistItem): VaultCategory {
  const text = `${item.document_type_required} ${item.details || ''}`.toLowerCase()
  if (/assurance|décennale|decennale|rc[_ ]?(civile|professionnelle)|trc|dommages/.test(text))
    return 'assurances'
  if (/chiffre|ca\b|bilan|financ|effectif/.test(text))
    return 'financier'
  if (/qualibat|certificat|référence|reference|qualification|caces|amiante|chantier/.test(text))
    return 'technique'
  return 'administratif'
}

interface Props {
  items: ChecklistItem[]
  onPickFromVault: (item: ChecklistItem) => void
  /** Conservé pour l'appelant : le coffre-fort s'ouvre depuis l'en-tête de l'étape. */
  onOpenVault?: () => void
  /** Confirmation de signature, quand le RC la demande (ex. DUME signé). */
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
  onOpenSource?: (item: ChecklistItem) => void
  /** « Non concerné » / « Je suis concerné » (réversible, journalisé). */
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
  /** Date limite de remise (AAAA-MM-JJ) : « À renouveler avant le dépôt ». */
  echeance?: string | null
}

export default function CandidatureSectionVault({
  items, onPickFromVault, onToggleSignature, onOpenSource, onNonConcerne, echeance,
}: Props) {
  const grouped = useMemo(() => {
    const map: Record<VaultCategory, ChecklistItem[]> = {
      administratif: [], assurances: [], financier: [], technique: [],
    }
    for (const item of items) map[categorize(item)].push(item)
    return map
  }, [items])

  if (items.length === 0) return null

  // Un sous-titre en capitales par famille de pièces, des cartes sur deux colonnes ; les comptes sont ceux du résumé (un seul calcul)
  return (
    <>
      {CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => (
        <SectionEtape key={cat} titre={CATEGORY_LABELS[cat]} colonnes={2}>
          {grouped[cat].map((item) => (
            <VaultRow
              key={item.id}
              item={item}
              onPick={() => onPickFromVault(item)}
              onToggleSignature={onToggleSignature}
              onOpenSource={onOpenSource}
              onNonConcerne={onNonConcerne}
              echeance={echeance}
            />
          ))}
        </SectionEtape>
      ))}
    </>
  )
}

function VaultRow({
  item, onPick, onToggleSignature, onOpenSource, onNonConcerne, echeance,
}: {
  item: ChecklistItem
  echeance?: string | null
  onPick: () => void
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
  onOpenSource?: (item: ChecklistItem) => void
  onNonConcerne?: (item: ChecklistItem, nonConcerne: boolean) => Promise<void>
}) {
  const statut = statutPiece(item, echeance)
  const { etat, texte, perimee } = etatDeStatut(statut)
  const note = noteValidite(item.document_type_required)
  const depot = noteDepot(item)
  const isLinked = !!item.linked_document_id
  // Rien de prêt dans le dossier : « Choisir » ; une pièce prête ou à confirmer : « Remplacer »
  const isMissing = statut.code !== 'pret' && statut.code !== 'a-confirmer'
  const source = item.source_document ? libelleSource({ document: item.source_document, page: item.source_page ?? null }) : null

  return (
    <Carte data-piece={item.id} className="grid min-w-0 content-start gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <FileText size={18} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
          <p className="min-w-0 break-words font-semibold text-fg">{nomPiece(item.document_type_required, item.details)}</p>
        </div>
        <NonConcerneBouton item={item} onNonConcerne={onNonConcerne} />
      </div>
      {(item.lot || (item.jointe && item.piece_nom) || (isLinked && !item.jointe)) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[1.875rem] text-sm text-fg-2">
          {item.lot && <PastilleEtat sens="gris" icone={null}>{item.lot.replace(/^lot/i, 'Lot ')}</PastilleEtat>}
          {item.jointe && item.piece_nom && <span className="break-words">{item.piece_nom}</span>}
          {isLinked && !item.jointe && <span>Lié au coffre-fort</span>}
        </p>
      )}
      {note && statut.action && <p className="piece-note">{note}</p>}
      {depot && <p className="piece-note">{depot}</p>}
      {item.source_in_rc && ['si-concerne', 'facultatif', 'attribution'].includes(statut.code) && (
        <p className="piece-note">Lu dans le <Sigle code="RC" /> : « {item.source_in_rc} »</p>
      )}
      <SignatureLigne item={item} onToggleSignature={onToggleSignature} onOpenSource={onOpenSource} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-bord pt-3">
        <EtatElement
          etat={etat}
          texte={texte}
          perimee={perimee}
          source={source ? { libelle: source, onVoir: item.source_exigence_id && onOpenSource ? () => onOpenSource(item) : undefined } : undefined}
        />
        {estNonConcernee(item) ? null : (
          <Bouton variante="secondaire" onClick={onPick}>{isMissing ? 'Choisir' : 'Remplacer'}</Bouton>
        )}
      </div>
    </Carte>
  )
}

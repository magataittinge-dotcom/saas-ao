import { useMemo } from 'react'
import { Sigle } from '@/components/common/Sigle'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'
import NonConcerneBouton, { estNonConcernee } from '@/components/project/NonConcerne'
import { noteDepot, noteValidite, statutPiece } from '@/lib/statutPiece'
import { SectionEtape } from '@/components/etape'
import { EtatDePiece, LignePiece, ListePieces } from '@/components/project/LignePiece'
import { MenuElement } from '@/components/ui/menu'
import { Bouton } from '@/components/ui/bouton'
import { nomPiece } from '@/lib/nomsPieces'
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

  // Un titre par famille de pièces, une liste par famille ; les comptes sont ceux du résumé (un seul calcul)
  return (
    <>
      {CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => (
        <SectionEtape key={cat} titre={CATEGORY_LABELS[cat]}>
          <ListePieces>
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
          </ListePieces>
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
  const note = noteValidite(item.document_type_required)
  const depot = noteDepot(item)
  const isLinked = !!item.linked_document_id
  // Rien de prêt dans le dossier : « Choisir » ; une pièce prête ou à confirmer : « Remplacer »
  const isMissing = statut.code !== 'pret' && statut.code !== 'a-confirmer'
  const source = item.source_document ? libelleSource({ document: item.source_document, page: item.source_page ?? null }) : null

  const voirSource = item.source_exigence_id && onOpenSource ? () => onOpenSource(item) : undefined
  const faits = [
    item.lot ? item.lot.replace(/^lot/i, 'Lot ') : null,
    item.jointe && item.piece_nom ? item.piece_nom : null,
    isLinked && !item.jointe ? 'Lié au coffre-fort' : null,
    source ? `Source : ${source}` : null,
  ].filter(Boolean)

  return (
    <LignePiece
      id={item.id}
      nom={nomPiece(item.document_type_required, item.details)}
      sous={<>
        {faits.length > 0 && <p className="mt-0.5 break-words text-sm text-fg-2">{faits.join(' · ')}</p>}
        {note && statut.action && <p className="piece-note">{note}</p>}
        {depot && <p className="piece-note">{depot}</p>}
        {item.source_in_rc && ['si-concerne', 'facultatif', 'attribution'].includes(statut.code) && (
          <p className="piece-note">Lu dans le <Sigle code="RC" />&nbsp;: «&nbsp;{item.source_in_rc}&nbsp;»</p>
        )}
        <SignatureLigne item={item} onToggleSignature={onToggleSignature} onOpenSource={onOpenSource} />
      </>}
      etat={<EtatDePiece statut={statut} />}
      actions={estNonConcernee(item) ? null : <Bouton variante="secondaire" onClick={onPick}>{isMissing ? 'Choisir' : 'Remplacer'}</Bouton>}
      menu={(
        <NonConcerneBouton item={item} onNonConcerne={onNonConcerne}>
          {voirSource && <MenuElement onSelect={voirSource}>Voir dans le dossier</MenuElement>}
        </NonConcerneBouton>
      )}
    />
  )
}

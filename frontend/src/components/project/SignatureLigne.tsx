import type { ChecklistItem } from '@/types'

// Signature d'une pièce de la checklist. La règle vient du serveur
// (signature_required, services/ai/checklist_matcher.signature_requise) :
//   • DC1, DC2, DUME — la réglementation n'impose pas de signature, sauf si
//     les documents de la consultation l'exigent (service-public F32144, F32106) ;
//   • acte d'engagement — signé à l'attribution (ATTRI1 ; R17445, F23784),
//     sauf exigence du RC dès l'offre ;
//   • déclaration sur l'honneur — confirmation toujours demandée.

// Chaque mention dit d'où elle vient : l'extrait du RC lu (avec son article et sa page, et un
// lien « Voir dans le DCE »), ou la règle générale citée (service-public). Jamais l'un sans l'autre.

export type MentionSignature =
  | { kind: 'case' }
  | { kind: 'texte'; texte: string }
  | { kind: 'rien' }

/** Règles générales, quand le RC ne dit rien de la signature (sources vérifiées, B1 §5). */
const REGLE_SANS_SIGNATURE = 'Aucune signature n’est exigée au dépôt, sauf si le règlement de la consultation la demande (service-public F32144, F32106).'
const REGLE_ATTRIBUTION = 'L’acte d’engagement est signé par l’attributaire (modèle ATTRI1 ; service-public R17445).'

/** « RC — Article 5.2 — Présentation des candidatures, page 7 » : où la ligne a été lue. */
export function libelleSourceRc(
  item: Pick<ChecklistItem, 'source_document' | 'source_page' | 'source_article'>,
): string | null {
  const doc = (item.source_document ?? '').trim()
  if (!doc && !item.source_article) return null
  const morceaux = [doc || 'RC', item.source_article, item.source_page ? `page ${item.source_page}` : null]
  return morceaux.filter(Boolean).join(' — ').replace(/ — page /, ', page ')
}

/** La règle qui accompagne la mention quand le RC n'exige pas de signature. */
export function regleSignature(
  item: Pick<ChecklistItem, 'document_type_required' | 'signature_required'>,
): string | null {
  if (item.signature_required) return null
  if (item.document_type_required === 'acte_engagement_template') return REGLE_ATTRIBUTION
  if (SIGNATURE_NON_DEMANDEE.has(item.document_type_required)) return REGLE_SANS_SIGNATURE
  return null
}

const SIGNATURE_NON_DEMANDEE = new Set(['dc1_template', 'dc2_template', 'dume'])

export function mentionSignature(
  item: Pick<ChecklistItem, 'document_type_required' | 'signature_required'>,
): MentionSignature {
  if (item.signature_required) return { kind: 'case' }
  if (item.document_type_required === 'acte_engagement_template') {
    return { kind: 'texte', texte: "Acte d'engagement : à signer à l'attribution" }
  }
  if (SIGNATURE_NON_DEMANDEE.has(item.document_type_required)) {
    return { kind: 'texte', texte: 'Signature non demandée pour ce formulaire' }
  }
  return { kind: 'rien' }
}

/** La pièce attend-elle encore la confirmation de signature ? (gate d'export) */
export function signatureAConfirmer(
  item: Pick<ChecklistItem, 'signature_required' | 'signature_confirmed'>,
): boolean {
  return !!item.signature_required && !item.signature_confirmed
}

export default function SignatureLigne({
  item, onToggleSignature, onOpenSource,
}: {
  item: ChecklistItem
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
  /** Ouvre le passage du RC lu (panneau « Voir dans le DCE »). */
  onOpenSource?: (item: ChecklistItem) => void
}) {
  const mention = mentionSignature(item)
  const regle = regleSignature(item)
  if (mention.kind === 'texte') {
    return (
      <div className="piece-signature">
        <p className="piece-note">{mention.texte}</p>
        {regle && <p className="piece-note">{regle}</p>}
      </div>
    )
  }
  if (mention.kind === 'rien' || !onToggleSignature) return null
  // « case » : le RC (ou la déclaration sur l'honneur) demande une signature
  const source = item.document_type_required === 'declaration_honneur' ? null : libelleSourceRc(item)
  return (
    <div className="piece-signature">
      <label className="piece-signature__case">
        <input
          type="checkbox"
          checked={item.signature_confirmed ?? false}
          onChange={(e) => onToggleSignature(item, e.target.checked)}
        />
        Je confirme avoir signé ce document
        {!item.signature_confirmed && <span className="piece-note">— requis pour compter conforme</span>}
      </label>
      {source && (
        <p className="piece-note">
          Le règlement de la consultation demande une signature. Source : {source}
          {onOpenSource && item.source_exigence_id && (
            <button type="button" className="piece-source" onClick={() => onOpenSource(item)}>
              Voir dans le DCE
            </button>
          )}
        </p>
      )}
    </div>
  )
}

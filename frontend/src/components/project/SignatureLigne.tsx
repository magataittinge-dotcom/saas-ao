import type { ChecklistItem } from '@/types'

// Signature d'une pièce de la checklist. La règle vient du serveur
// (signature_required, services/ai/checklist_matcher.signature_requise) :
//   • DC1, DC2, DUME — la réglementation n'impose pas de signature, sauf si
//     les documents de la consultation l'exigent (service-public F32144, F32106) ;
//   • acte d'engagement — signé à l'attribution (ATTRI1 ; R17445, F23784),
//     sauf exigence du RC dès l'offre ;
//   • déclaration sur l'honneur — confirmation toujours demandée.

export type MentionSignature =
  | { kind: 'case' }
  | { kind: 'texte'; texte: string }
  | { kind: 'rien' }

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
  item, onToggleSignature,
}: {
  item: ChecklistItem
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
}) {
  const mention = mentionSignature(item)
  if (mention.kind === 'texte') {
    return <p className="text-xs mt-1.5" style={{ color: '#909195' }}>{mention.texte}</p>
  }
  if (mention.kind === 'rien' || !onToggleSignature) return null
  return (
    <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer" style={{ color: '#959597' }}>
      <input
        type="checkbox"
        checked={item.signature_confirmed ?? false}
        onChange={(e) => onToggleSignature(item, e.target.checked)}
      />
      Je confirme avoir signé ce document
      {!item.signature_confirmed && (
        <span style={{ color: '#909195' }}>— requis pour compter conforme</span>
      )}
    </label>
  )
}

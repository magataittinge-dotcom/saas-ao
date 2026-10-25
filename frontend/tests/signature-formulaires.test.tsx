// Signature de DC1, DC2, DUME et de l'acte d'engagement (mission V, tranche 2).
// Sources : service-public F32144 et F32106 (DC1, DC2, DUME : pas de signature
// imposée, sauf exigence des documents de la consultation) ; ATTRI1, R17445
// (acte d'engagement signé à l'attribution). La règle vient du serveur
// (signature_required) : le front ne garde plus de liste de types « à signer ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import { mentionSignature, signatureAConfirmer } from '@/components/project/SignatureLigne'
import type { ChecklistItem } from '@/types'
import { lire } from './outils/sources'

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'dc1_template', source_kind: 'dce_template',
  status: 'present', document_group: 'completer', ...over,
})
const rien = async () => {}

const formulaires = (items: ChecklistItem[]) => renderToStaticMarkup(
  <CandidatureSectionTemplates projectId="p" items={items} onUploadCompleted={rien} onToggleSignature={rien} />,
)

test('DC1 et DC2 sans exigence du RC : signature non demandée, aucune case', () => {
  const html = formulaires([
    ligne({ id: 'a', document_type_required: 'dc1_template', signature_required: false }),
    ligne({ id: 'b', document_type_required: 'dc2_template', signature_required: false }),
  ])
  assert.equal(html.split('Signature non demandée pour ce formulaire').length - 1, 2)
  assert.ok(!html.includes('Je confirme avoir signé'))
})

test("acte d'engagement : à signer à l'attribution, aucune case", () => {
  const html = formulaires([ligne({ document_type_required: 'acte_engagement_template', signature_required: false })])
  assert.ok(html.includes("Acte d&#x27;engagement : à signer à l&#x27;attribution"), html)
  assert.ok(!html.includes('Je confirme avoir signé'))
})

test('signature exigée par le RC : la case reste demandée', () => {
  const html = formulaires([ligne({ document_type_required: 'dc1_template', signature_required: true })])
  assert.ok(html.includes('Je confirme avoir signé ce document'))
  assert.ok(html.includes('type="checkbox"'))
  assert.ok(!html.includes('Signature non demandée'))
})

test('DUME (pièce du coffre) : signature non demandée', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[ligne({ document_type_required: 'dume', source_kind: 'vault', status: 'manquant',
        document_group: 'fournir', signature_required: false })]}
      onPickFromVault={() => {}}
      onOpenVault={() => {}}
      onToggleSignature={rien}
    />,
  )
  assert.ok(html.includes('Signature non demandée pour ce formulaire'))
  assert.ok(!html.includes('Je confirme avoir signé'))
})

test('en-tête des formulaires : plus de consigne « signez » pour tous', () => {
  const html = formulaires([ligne({ signature_required: false })])
  assert.ok(!html.includes('compléter et signer'), html)
  assert.ok(!html.includes('complétez et signez'), html)
})

test('règle commune : mention et confirmation à faire', () => {
  assert.deepEqual(mentionSignature({ document_type_required: 'dume', signature_required: false }),
    { kind: 'texte', texte: 'Signature non demandée pour ce formulaire' })
  assert.deepEqual(mentionSignature({ document_type_required: 'urssaf', signature_required: false }), { kind: 'rien' })
  assert.deepEqual(mentionSignature({ document_type_required: 'declaration_honneur', signature_required: true }), { kind: 'case' })
  assert.equal(signatureAConfirmer({ signature_required: true, signature_confirmed: false }), true)
  assert.equal(signatureAConfirmer({ signature_required: true, signature_confirmed: true }), false)
  assert.equal(signatureAConfirmer({ signature_required: false, signature_confirmed: false }), false)
})

test("l'écran Export ne garde plus de liste de types à signer en dur", () => {
  const code = lire('src/routes/project/StepExport.tsx')
  assert.ok(!code.includes('SIGNABLE'), 'StepExport.tsx contient encore une liste SIGNABLE')
  assert.ok(!lire('src/components/project/CandidatureSectionTemplates.tsx').includes('SIGNABLE'))
})

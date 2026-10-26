// « Non concerné » sur une pièce (B2 §7 n°8) : un bouton par pièce (coffre et
// formulaires), réversible (« Je suis concerné »), et la pièce sort des comptes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { piecesComptees } from '@/components/project/NonConcerne'
import type { ChecklistItem } from '@/types'

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'urssaf', source_kind: 'vault',
  status: 'manquant', document_group: 'fournir', details: 'Pièce inventée', ...over,
})
const rien = async () => {}

test('la pièce « Non concerné » sort des comptes', () => {
  const items = [ligne({ id: 'a' }), ligne({ id: 'b', status: 'non_applicable' }), ligne({ id: 'c', status: 'present' })]
  assert.deepEqual(piecesComptees(items).map((i) => i.id), ['a', 'c'])
})

test('pièce du coffre : bouton « Non concerné », puis « Je suis concerné »', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[ligne({ id: 'a', details: 'Attestation URSSAF' }), ligne({ id: 'b', details: 'DC4 sous-traitance', status: 'non_applicable' })]}
      onPickFromVault={() => {}} onOpenVault={() => {}} onNonConcerne={rien}
    />,
  )
  assert.equal(html.split('Je suis concerné').length - 1, 1, html)
  assert.equal(html.split('>Choisir<').length - 1, 1, 'la pièce non concernée ne propose plus de choisir')
  assert.ok(html.includes('Non concerné'))
})

test('formulaire non concerné : plus d’import proposé, reprise possible', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionTemplates
      projectId="p"
      items={[ligne({ id: 'd', document_type_required: 'dc4', source_kind: 'dce_template', document_group: 'completer', status: 'non_applicable' })]}
      onUploadCompleted={rien} onNonConcerne={rien}
    />,
  )
  assert.ok(html.includes('Je suis concerné'), html)
  assert.ok(!html.includes('Importer rempli'), html)
})

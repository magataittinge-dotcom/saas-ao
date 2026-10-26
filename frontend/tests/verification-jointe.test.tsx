// « Jointe » aussi à l'écran Vérification (bloc 2, tranche 6), même règle
// factuelle que l'Export ; plus de « Conforme » ni de « Complété », plus de
// fraction dans les en-têtes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { comptePieces, libelleJointes } from '@/lib/exportDossier'
import type { ChecklistItem } from '@/types'
import { textesAffiches } from './outils/textes'

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'kbis', source_kind: 'vault',
  status: 'present', document_group: 'fournir', details: 'Extrait Kbis', ...over,
})
const sansBalises = (html: string) => html.replace(/<[^>]+>/g, ' ')

test('pièce du coffre : « Jointe — nom · valable jusqu’au … », jamais « Conforme »', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[
        ligne({ id: 'a', jointe: true, piece_nom: 'kbis.pdf', valable_jusqu_au: '2027-03-01' }),
        ligne({ id: 'b', jointe: false, details: 'Attestation RC', linked_document_id: 'x' }),
      ]}
      onPickFromVault={() => {}} onOpenVault={() => {}}
    />,
  )
  assert.ok(html.includes('Jointe — kbis.pdf · valable jusqu’au 01/03/2027'), html)
  assert.ok(!html.includes('Conforme'))
  assert.ok(sansBalises(html).includes('2 pièces, dont 1 jointe'), sansBalises(html))
  assert.ok(!/\d+\s*\/\s*\d+/.test(sansBalises(html).replace('01/03/2027', '')), 'aucune fraction')
})

test('formulaire : « Jointe — nom », jamais « Complété »', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionTemplates
      projectId="p"
      items={[ligne({ id: 'f', document_type_required: 'dc1_template', source_kind: 'dce_template',
        document_group: 'completer', jointe: true, piece_nom: 'DC1_rempli.pdf', completed_project_doc_id: 'c' })]}
      onUploadCompleted={async () => {}}
    />,
  )
  assert.ok(html.includes('Jointe — DC1_rempli.pdf'), html)
  assert.ok(!html.includes('Complété'), html)
  assert.ok(sansBalises(html).includes('1 formulaire, joint'), sansBalises(html))
})

test('comptes sans fraction', () => {
  assert.equal(comptePieces(4, 0), '4 pièces')
  assert.equal(comptePieces(4, 2), '4 pièces, dont 2 jointes')
  assert.equal(comptePieces(3, 1, 'formulaire'), '3 formulaires, dont 1 joint')
  assert.equal(libelleJointes(5, 3), 'pièces demandées, dont 3 jointes')
  assert.equal(libelleJointes(1, 1), 'pièce demandée, jointe')
})

test('l’écran Vérification ne dit plus « pièces réunies » ni « Conformité x/y »', () => {
  const textes = textesAffiches('src/routes/project/StepVerification.tsx').map((t) => t.texte)
  assert.ok(!textes.some((t) => t.includes('pièces réunies')))
  assert.ok(!textes.some((t) => /Conformité \{?/.test(t)), textes.filter((t) => t.includes('Conformité')).join(' | '))
})

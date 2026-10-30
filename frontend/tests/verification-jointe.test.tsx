// « Jointe » aussi à l'écran Vérification (bloc 2, tranche 6), même règle
// factuelle que l'Export ; plus de « Conforme » ni de « Complété », plus de
// fraction dans les en-têtes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import { libelleComptes, suiteComptes } from '@/lib/statutPiece'
import type { ChecklistItem } from '@/types'
import { textesAffiches } from './outils/textes'

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'kbis', source_kind: 'vault',
  status: 'present', document_group: 'fournir', details: 'Extrait Kbis', ...over,
})
const sansBalises = (html: string) => html.replace(/<[^>]+>/g, ' ')

test('pièce du coffre : « Prêt — valable jusqu’au … » et le nom du fichier, jamais « Conforme »', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[
        ligne({ id: 'a', jointe: true, piece_nom: 'kbis.pdf', valable_jusqu_au: '2027-03-01' }),
        ligne({ id: 'b', jointe: false, details: 'Attestation RC', linked_document_id: 'x' }),
      ]}
      onPickFromVault={() => {}} onOpenVault={() => {}}
    />,
  )
  assert.ok(html.includes('Prêt — valable jusqu’au 01/03/2027'), html)
  assert.ok(html.includes('kbis.pdf'), html)
  assert.ok(!html.includes('Conforme'))
  assert.ok(sansBalises(html).includes('1 pièce à joindre · 1 prête'), sansBalises(html))
  assert.ok(!/\d+\s*\/\s*\d+/.test(sansBalises(html).replace('01/03/2027', '')), 'aucune fraction')
})

test('formulaire : « Prêt » et le nom du fichier, jamais « Complété »', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionTemplates
      projectId="p"
      items={[ligne({ id: 'f', document_type_required: 'dc1_template', source_kind: 'dce_template',
        document_group: 'completer', jointe: true, piece_nom: 'DC1_rempli.pdf', completed_project_doc_id: 'c' })]}
      onUploadCompleted={async () => {}}
    />,
  )
  assert.ok(html.includes('DC1_rempli.pdf'), html)
  assert.ok(sansBalises(html).includes('Prêt'), html)
  assert.ok(!html.includes('Complété'), html)
  assert.ok(sansBalises(html).includes('0 formulaire à joindre · 1 prêt'), sansBalises(html))
})

test('comptes sans fraction', () => {
  assert.equal(libelleComptes(4, 0), '4 pièces à joindre · 0 prête')
  assert.equal(libelleComptes(2, 2), '2 pièces à joindre · 2 prêtes')
  assert.equal(libelleComptes(1, 1, 'formulaire'), '1 formulaire à joindre · 1 prêt')
  assert.equal(suiteComptes(3, 5), 'pièces à joindre · 5 prêtes')
  assert.equal(suiteComptes(1, 0), 'pièce à joindre · 0 prête')
})

test('l’écran Vérification ne dit plus « pièces réunies » ni « Conformité x/y »', () => {
  const textes = textesAffiches('src/routes/project/StepVerification.tsx').map((t) => t.texte)
  assert.ok(!textes.some((t) => t.includes('pièces réunies')))
  assert.ok(!textes.some((t) => /Conformité \{?/.test(t)), textes.filter((t) => t.includes('Conformité')).join(' | '))
})

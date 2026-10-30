// Bloc 9, tranche 3 — « Déposé le … par … » : date dans le fuseau de Paris, auteur nommé,
// rien tant que personne n'a rien posé ; affiché sous le statut, avec une classe sémantique.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { noteDepot } from '@/lib/statutPiece'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import type { ChecklistItem } from '@/types'

test('la note dit la date et l’auteur, rien sans dépôt', () => {
  assert.equal(noteDepot({ depose_le: '2026-11-12T09:30:00Z', depose_par: 'Fatima B.' }), 'Déposé le 12/11/2026 par Fatima B.')
  assert.equal(noteDepot({ depose_le: '2026-11-12T09:30:00Z', depose_par: null }), 'Déposé le 12/11/2026')
  assert.equal(noteDepot({ depose_le: null, depose_par: 'Fatima B.' }), null)
  assert.equal(noteDepot({}), null)
  assert.equal(noteDepot({ depose_le: 'pas une date' }), null)
})

test('la date suit le fuseau de Paris : 23 h 30 UTC est déjà le lendemain à Paris', () => {
  assert.equal(noteDepot({ depose_le: '2026-11-12T23:30:00Z' }), 'Déposé le 13/11/2026')
  assert.equal(noteDepot({ depose_le: '2026-07-12T22:30:00Z' }), 'Déposé le 13/07/2026')   // heure d'été
})

const ligne = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'l', project_id: 'p', document_type_required: 'urssaf', source_kind: 'vault',
  status: 'manquant', document_group: 'fournir', details: 'Attestation de vigilance', ...over,
})

test('la ligne affiche « Déposé le … par … » sous le statut', () => {
  const html = renderToStaticMarkup(
    <CandidatureSectionVault
      items={[ligne({ id: 'a', status: 'present', jointe: true, piece_nom: 'urssaf.pdf',
        valable_jusqu_au: '2027-03-01', depose_le: '2026-11-12T09:30:00Z', depose_par: 'Fatima B.' }),
        ligne({ id: 'b' })]}
      onPickFromVault={() => {}} onOpenVault={() => {}}
    />,
  )
  assert.equal((html.match(/Déposé le 12\/11\/2026 par Fatima B\./g) ?? []).length, 1)
  assert.ok(html.includes('class="piece-note">Déposé le'))
})

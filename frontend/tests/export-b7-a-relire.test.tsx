// Export après B7 : un formulaire déposé que le serveur dit « À relire » (ni raison sociale ni SIRET du profil dans son texte).
// La ligne porte le nom du formulaire, comme sur Pièces, et le motif du serveur en note ; la pièce part dans le ZIP, elle est
// comptée à part (« N à relire »), jamais avec « à joindre » ni sous « Aucune pièce n'est encore jointe ». Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notePiece, titrePiece } from '@/routes/project/StepExport'
import { nomPiece } from '@/lib/nomsPieces'

const MOTIF = 'Renseignez votre raison sociale ou votre SIRET dans « Mon entreprise » : Synorix pourra relire ce formulaire. Fichier déposé : DC2 - Entreprise E2E.pdf.'
const dc2 = {
  document_type_required: 'dc2_template', source_kind: 'dce_template', status: 'warning', details: MOTIF, a_relire: true,
}

test('la ligne d’un formulaire « À relire » porte le nom du formulaire, comme sur Pièces ; le motif en note', () => {
  assert.equal(titrePiece(dc2), nomPiece('dc2_template', null))
  assert.equal(titrePiece(dc2), 'Déclaration du candidat (DC2)')
  assert.equal(notePiece(dc2), MOTIF)
  assert.doesNotMatch(titrePiece(dc2), /Renseignez|Fichier déposé/)
})

test('un formulaire prêt : son nom, pas de note ; une pièce du coffre garde son libellé', () => {
  assert.equal(titrePiece({ ...dc2, status: 'present', a_relire: false, details: null }), 'Déclaration du candidat (DC2)')
  assert.equal(notePiece({ ...dc2, status: 'present', a_relire: false }), null)
  const coffre = { document_type_required: 'urssaf', source_kind: 'vault', status: 'manquant', details: 'Attestation de vigilance URSSAF' }
  assert.equal(titrePiece(coffre), 'Attestation de vigilance URSSAF')
  assert.equal(notePiece(coffre), null)
})

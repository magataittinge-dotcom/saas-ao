// Export après B7 : un formulaire déposé que le serveur dit « À relire » (ni raison sociale ni SIRET du profil dans son texte).
// La ligne porte le nom du formulaire, comme sur Pièces, et le motif du serveur en note ; la pièce part dans le ZIP, elle est
// comptée à part (« N à relire »), jamais avec « à joindre » ni sous « Aucune pièce n'est encore jointe ». Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notePiece, titrePiece } from '@/routes/project/StepExport'
import { nomPiece } from '@/lib/nomsPieces'
import { bilanPiecesExport, ligneEtatDossier, phrasePiecesARelire } from '@/lib/exportDossier'
import { cartesPieces, comptesDetailles, phraseComptes, phraseComptesUtiles } from '@/lib/resumePieces'
import { lire, sansCommentaires } from './outils/sources'

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

// ── Les comptes de l'Export ─────────────────────────────────────────────────
const coffre = { id: 'c1', document_type_required: 'urssaf', source_kind: 'vault', status: 'manquant', document_group: 'fournir', details: null }
const dc1 = { id: 'f1', document_type_required: 'dc1_template', source_kind: 'dce_template', status: 'manquant', document_group: 'completer', details: null }
const dc2ARelire = { id: 'f2', ...dc2, document_group: 'completer' }
const pret = { id: 'p1', document_type_required: 'kbis', source_kind: 'vault', status: 'present', jointe: true, document_group: 'fournir', details: null }

test('Export : une pièce « À relire » est comptée à part, jamais avec « à joindre » ; elle est jointe au dossier', () => {
  const b = bilanPiecesExport([coffre, dc1, dc2ARelire], null, () => false)
  assert.deepEqual(b.aFaire.map((i) => i.id), ['c1', 'f1'])
  assert.deepEqual(b.aRelire.map((i) => i.id), ['f2'])
  assert.equal(b.pretes, 0)
  assert.equal(b.aucuneJointe, false)
  // sans formulaire déposé, rien n'est joint ; avec une pièce prête, non plus « aucune »
  assert.equal(bilanPiecesExport([coffre, dc1], null, () => false).aucuneJointe, true)
  assert.equal(bilanPiecesExport([coffre, pret], null, () => false).aucuneJointe, false)
  // une signature à confirmer garde la pièce dans « à joindre ou à confirmer »
  assert.deepEqual(bilanPiecesExport([pret], null, () => true).aFaire.map((i) => i.id), ['p1'])
})

test('Export : les phrases disent juste (« N à relire », il part dans le dossier)', () => {
  assert.equal(phrasePiecesARelire(0), null)
  assert.equal(phrasePiecesARelire(1), '1 formulaire à relire avant le dépôt. Il part dans le dossier tel que vous l’avez déposé.')
  assert.equal(phrasePiecesARelire(2), '2 formulaires à relire avant le dépôt. Ils partent dans le dossier tels que vous les avez déposés.')
  assert.equal(ligneEtatDossier(2, 1, false, 1), '2 pièces à joindre ou à confirmer · 1 à relire avant le dépôt')
  assert.equal(ligneEtatDossier(0, 1, false, 1), '1 formulaire à relire avant le dépôt')
  assert.equal(ligneEtatDossier(2, 1, false), '2 pièces à joindre ou à confirmer avant le dépôt')
  for (const p of [phrasePiecesARelire(1), phrasePiecesARelire(3), ligneEtatDossier(1, 1, false, 2)]) {
    assert.doesNotMatch(p ?? '', /manquant|incomplet|absent|!/i)
  }
})

test('résumé des pièces : « À relire » a sa case et son compte, hors de « À joindre »', () => {
  const pieces = [coffre, dc1, dc2ARelire, pret]
  const c = comptesDetailles(pieces, null)
  assert.deepEqual({ pretes: c.pretes, aJoindre: c.aJoindre, aRelire: c.aRelire, total: c.total }, { pretes: 1, aJoindre: 2, aRelire: 1, total: 4 })
  assert.equal(phraseComptes(c), '1 prête · 2 à joindre · 0 à renouveler · 1 à relire')
  assert.equal(phraseComptesUtiles(c), '1 prête · 2 à joindre · 1 à relire')
  const cartes = cartesPieces(pieces, null)
  const relire = cartes.find((k) => k.libelle === 'À relire')
  assert.equal(relire?.valeur, '1')
  assert.equal(cartes.find((k) => k.libelle === 'À joindre')?.valeur, '2')
  // sans formulaire à relire, pas de case vide
  assert.equal(cartesPieces([coffre, pret], null).some((k) => k.libelle === 'À relire'), false)
})

test('l’écran Export lit le bilan : plus de « Aucune pièce n’est encore jointe » calculé à part', () => {
  const src = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.match(src, /bilanPiecesExport\(/)
  assert.match(src, /phrasePiecesARelire\(/)
  assert.match(src, /notePiece\(item\)/)
})

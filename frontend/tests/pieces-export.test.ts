// Pièces du dossier — décision de Mohamed du 25/10 (point 3) : « Jointe » est
// un fait vérifiable (le fichier part dans le ZIP, valable et daté), affiché
// avec son nom et sa date de validité. L'écran Export ne liste que ce que le
// ZIP contient (pieces_zip) et n'affiche plus aucune fraction « x/y ».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etatPiece, phrasePiecesAJoindre } from '@/lib/exportDossier'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

test('« Prêt — valable jusqu’au … » seulement si c’est un fait, sinon « À joindre »', () => {
  assert.equal(
    etatPiece({ status: 'present', jointe: true, piece_nom: 'kbis.pdf', valable_jusqu_au: '2027-03-01' }).texte,
    'Prêt — valable jusqu’au 01/03/2027')
  assert.equal(etatPiece({ status: 'present', jointe: true, piece_nom: 'DC1.pdf', valable_jusqu_au: null }).texte, 'Prêt')
  assert.equal(etatPiece({ status: 'present', jointe: true }).ton, 'ok')
  // « present » sans fait vérifiable (fichier parti du serveur…) : jamais « Prêt »
  assert.equal(etatPiece({ status: 'present', jointe: false }).texte, 'À joindre')
  assert.equal(etatPiece({ status: 'expire', jointe: false }).texte, 'À renouveler')
  assert.equal(etatPiece({ status: 'warning', jointe: false }).texte, 'Date de validité à confirmer')
  assert.equal(etatPiece({ status: 'manquant', jointe: false }).texte, 'À joindre')
  assert.equal(etatPiece({ status: 'non_applicable', jointe: false }).texte, 'Non concerné')
})

test('l’écran Export : plus de « pièces conformes x/y », liste du ZIP = pieces_zip', () => {
  const textes = textesAffiches('src/routes/project/StepExport.tsx').map((t) => t.texte)
  for (const ancien of ['pièces conformes', 'Pièces Administratives', 'conformes)', 'Pièces du dossier ZIP (${detail.project_documents']) {
    assert.ok(!textes.some((t) => t.includes(ancien)), ancien)
  }
  const code = lire('src/routes/project/StepExport.tsx')
  assert.ok(code.includes('detail.pieces_zip'), 'la liste du ZIP vient de pieces_zip')
  assert.ok(!code.includes('detail.project_documents'), 'plus les documents du DCE dans la liste du ZIP')
})

// ── S6 — Export à un seul bouton : l'avertissement des pièces est une ligne au-dessus du bouton ──

test('la ligne dit combien de pièces sont à joindre et qu\'elles ne seront pas dans le dossier', () => {
  assert.equal(phrasePiecesAJoindre(6), '6 pièces sont à joindre. Elles ne seront pas dans le dossier.')
  assert.equal(phrasePiecesAJoindre(1), '1 pièce est à joindre. Elle ne sera pas dans le dossier.')
  assert.equal(phrasePiecesAJoindre(0), null)
  for (const n of [1, 2, 12]) assert.doesNotMatch(phrasePiecesAJoindre(n)!, /manquant|incomplet|absent|erreur|attention/i)
})

test('l\'export a un seul bouton principal ; PDF seul et Word seul sont sous « Autres formats » ; les points de contrôle sont repliés', () => {
  const code = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.equal((code.match(/signature-btn/g) ?? []).length, 1, 'un seul bouton principal')
  assert.ok(code.includes('Télécharger le dossier'))
  assert.doesNotMatch(code, /Exporter quand même|showGateWarning|Télécharger le dossier ZIP|Livrables/)
  assert.doesNotMatch(code, /var\(--warning-bg\)/, 'plus de bouton orange')
  assert.match(code, /<PiecesAJoindre pieces=\{nonConformes\} \/>/)
  // « Autres formats » : un repli fermé qui contient les deux sorties, et seulement elles
  const autres = code.slice(code.indexOf('Autres formats'))
  assert.ok(code.includes('Autres formats'))
  assert.ok(autres.indexOf('Mémoire PDF') > 0 && autres.indexOf('Mémoire Word') > autres.indexOf('Mémoire PDF'))
  assert.ok(code.indexOf('Télécharger le dossier') < code.indexOf('Autres formats'))
  // les points de contrôle sont dans un repli fermé
  const iPoints = code.indexOf('Points de contrôle')
  assert.ok(/<details(?![^>]*\bopen\b)[^>]*>\s*<summary[^>]*>\s*Points de contrôle/.test(code), 'Points de contrôle dans un <details> fermé')
  assert.ok(iPoints > 0)
})

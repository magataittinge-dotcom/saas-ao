// Étapes Pièces et Export dans le gabarit : cartes de résumé tirées des statuts existants, un seul bouton en dégradé par écran. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartesPieces } from '@/lib/resumePieces'
import { lire, sansCommentaires } from './outils/sources'

const PIECES = [
  { status: 'present', jointe: true, valable_jusqu_au: '2027-06-01' },
  { status: 'present', jointe: true, valable_jusqu_au: '2027-06-01' },
  { status: 'present', jointe: true, valable_jusqu_au: '2026-12-01' },   // périme avant la remise : à renouveler
  { status: 'expire', valable_jusqu_au: '2026-09-01' },
  { status: 'manquant' },
  { status: 'warning' },
  { status: 'manquant', obligation: 'si_concerne' },                     // « si concerné » : pas à joindre maintenant
  { status: 'non_applicable' },
]

test('Pièces : prêtes, à joindre (dont à confirmer), à renouveler — les statuts de statutPiece, rien d’autre', () => {
  const [pretes, aJoindre, aRenouveler] = cartesPieces(PIECES, '2027-03-01', {
    coffre: { aJoindre: 2, pretes: 3 }, formulaires: { aJoindre: 1, pretes: 0 },
  })
  assert.deepEqual([pretes.libelle, pretes.valeur], ['Prêtes', '2'])
  assert.deepEqual(pretes.jauge, { rempli: 2, total: 6 })
  assert.deepEqual([aJoindre.libelle, aJoindre.valeur, aJoindre.etat], ['À joindre', '2', 'a-verifier'])
  assert.deepEqual([aRenouveler.libelle, aRenouveler.valeur], ['À renouveler', '2'])
  assert.match(pretes.detail ?? '', /^Coffre-fort : 2 pièces à joindre · 3 prêtes$/)
  assert.match(aJoindre.detail ?? '', /Formulaires de l’acheteur : 1 formulaire à joindre · 0 prêt/)
})

test('Pièces : tout est prêt', () => {
  const cartes = cartesPieces([{ status: 'present', jointe: true }], null)
  assert.deepEqual(cartes.map((c) => [c.valeur, c.etat]), [['1', 'pret'], ['0', 'pret'], ['0', 'pret']])
})

test('un seul bouton en dégradé par écran : l’action de l’en-tête, jamais doublée sur ordinateur par la barre ni par une autre carte', () => {
  const analyse = sansCommentaires(lire('src/routes/project/StepAnalysis.tsx'))
  assert.equal((analyse.match(/variant="signature"/g) ?? []).length, 1)
  assert.match(analyse, /<ActionsBarreTel>\s*<BoutonSuite/)
  const decision = sansCommentaires(lire('src/components/project/SynorixScoreCard.tsx'))
  assert.doesNotMatch(decision, /signature-btn/, '« On y va » n’est pas un second bouton principal')
  const export_ = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.equal((export_.match(/signature-btn/g) ?? []).length, 1, 'le bouton est écrit une fois')
  assert.match(export_, /actionPrincipale=\{[\s\S]*?\{boutonTelecharger\}/)
  assert.match(export_, /<ActionsBarreTel className="max-\[768px\]:flex-1">\{boutonTelecharger\}<\/ActionsBarreTel>/)
  const lots = sansCommentaires(lire('src/routes/project/StepLotSelection.tsx'))
  assert.match(lots, /<ActionsBarreTel>\s*<button/)
  const verification = sansCommentaires(lire('src/routes/project/StepVerification.tsx'))
  assert.doesNotMatch(verification, /actionPrincipale=/, 'Pièces : l’unique action principale est « Étape suivante » de la barre')
})
